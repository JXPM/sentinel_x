// Source de données du dashboard.
// VITE_DATA_SOURCE=api (défaut) : données réelles. Caméra et détection via ai/vision/detect.py
//   (/video), alertes via l'API FastAPI, capteurs via le WebSocket /ws ; tant que l'ESP
//   n'envoie rien, les capteurs rejouent le jeu de données de la filière IA.
// VITE_DATA_SOURCE=mock : simulation hors matériel, avec sélecteur de scénario.
import { useEffect, useReducer, useRef } from 'react';
import { fr } from '../lib/format';
import { SEVERITY_LEVEL } from '../lib/levels';
import type { Alert, Banner, Level, Sample, Scenario, Sentinel, ServiceRow, VisionState } from '../types';
import type { Actuators, Command, LedId, LedMode } from '../types';
import { actuatorReducer, BUZZ_MS, initialActuators, type ActuatorAction } from './actuators';
import { ackAlert, connectSocket, fetchAlerts, fetchVisionStatus, sendCommand, toAlert, videoUrl, type VisionStatus, type WsMessage } from './api';
import { loadReplay, replayHistory, sampleAt, type Replay } from './replay';
import { initialAlerts, SIM_SECS_PER_SAMPLE, simAlerts, simBanner, simBase, simLevel, simSample } from './simulator';

/* ------------------------------------------------------------------ */
/* Effet commun : arrêt du buzzer après BUZZ_MS                         */
/* ------------------------------------------------------------------ */
function useBuzzTimer(act: Actuators, dispatch: (a: ActuatorAction) => void) {
  useEffect(() => {
    if (!act.buzzing) return;
    const t = window.setTimeout(() => dispatch({ type: 'buzzEnd' }), BUZZ_MS);
    return () => window.clearTimeout(t);
  }, [act.buzzing, act.buzzSeq, dispatch]);
}

const isActuator = (a: { type: string }): a is ActuatorAction =>
  a.type === 'buzz' || a.type === 'buzzEnd' || a.type === 'led' || a.type === 'toggleAuto';

/* ------------------------------------------------------------------ */
/* Mode démo                                                            */
/* ------------------------------------------------------------------ */
interface MockState {
  base: number;
  tick: number;
  since: number;
  scenario: Scenario;
  playing: boolean;
  samples: Sample[];
  alerts: Alert[];
  nextId: number;
  fired: Record<string, boolean>;
  act: Actuators;
}

type MockAction =
  | { type: 'step' }
  | { type: 'scenario'; scenario: Scenario }
  | { type: 'togglePlay' }
  | { type: 'ack'; id: number }
  | { type: 'ackAll' }
  | ActuatorAction;

function initMock(): MockState {
  const base = simBase();
  const samples: Sample[] = [];
  for (let i = 0; i < 120; i++) samples.push(simSample('nominal', 0, i, base + i * SIM_SECS_PER_SAMPLE * 1000));
  return {
    base, tick: 120, since: 0, scenario: 'nominal', playing: true, samples,
    alerts: initialAlerts(base), nextId: 4, fired: {}, act: initialActuators,
  };
}

function mockReducer(s: MockState, a: MockAction): MockState {
  if (isActuator(a)) return { ...s, act: actuatorReducer(s.act, a) };
  switch (a.type) {
    case 'step': {
      if (!s.playing) return s;
      const k = s.since + 1;
      const tick = s.tick + 1;
      const ts = s.base + tick * SIM_SECS_PER_SAMPLE * 1000;
      const sample = simSample(s.scenario, k, tick, ts);
      const samples = [...s.samples, sample].slice(-120);
      const lvl = simLevel(s.scenario, k, sample);
      const r = simAlerts(s.scenario, lvl, samples, s.fired, s.act.auto);
      let nextId = s.nextId;
      const iso = new Date(ts).toISOString();
      const added = r.newAlerts.map((x) => ({ ...x, id: nextId++, ts: iso, acked: false }));
      const fired = { ...s.fired };
      r.fired.forEach((key) => { fired[key] = true; });
      return {
        ...s, tick, since: k, samples, nextId, fired,
        alerts: [...added.reverse(), ...s.alerts].slice(0, 12),
        act: r.autoBuzz ? actuatorReducer(s.act, { type: 'buzz', auto: true }) : s.act,
      };
    }
    case 'scenario': return { ...s, scenario: a.scenario, since: 0, fired: {} };
    case 'togglePlay': return { ...s, playing: !s.playing };
    case 'ack': return { ...s, alerts: s.alerts.map((x) => (x.id === a.id ? { ...x, acked: true } : x)) };
    case 'ackAll': return { ...s, alerts: s.alerts.map((x) => ({ ...x, acked: true })) };
  }
}

function useMockSource(): Sentinel {
  const [s, dispatch] = useReducer(mockReducer, undefined, initMock);

  useEffect(() => {
    const t = window.setInterval(() => dispatch({ type: 'step' }), 1000);
    return () => window.clearInterval(t);
  }, []);
  useBuzzTimer(s.act, dispatch);

  const last = s.samples[s.samples.length - 1];
  const level = simLevel(s.scenario, s.since, last);
  const person = s.scenario === 'intrusion';
  const ms = 34 + Math.round(Math.abs(Math.sin(s.tick * 1.7)) * 9);
  const boxLeft = 36 + Math.sin(s.tick / 4) * 5;
  // Boîte simulée placée sous le texte du HUD et au-dessus du bandeau du bas
  const x1 = (boxLeft / 100) * 640;
  const y1 = 115;
  const vision: VisionState = {
    online: true,
    person,
    conf: 0.87,
    ms,
    fps: Math.round(1000 / (ms + 4)),
    confirmFrames: person ? (s.since >= 2 ? 3 : s.since + 1) : 0,
    confirmNeeded: 3,
    bbox: person ? [x1, y1, x1 + 120, y1 + 225] : null,
    objects: [],
    infoObjects: [],
    abandoned: false,
    abandonedSecs: 0,
    threat: false,
    presentSecs: person ? s.since * SIM_SECS_PER_SAMPLE : 0,
    loitering: false,
    frame: [640, 480],
    camera: null,
  };
  const services: ServiceRow[] = [
    { name: 'ESP8266 sx-001', detail: 'Télémétrie MQTTS toutes les 2 s', value: 'RSSI −61 dBm', state: 'ok' },
    { name: 'Broker Mosquitto', detail: 'Port 8883 · TLS 1.2 · comptes et ACL', value: 'en ligne', state: 'ok' },
    { name: 'API FastAPI', detail: 'POST /api/v1/alerts · WebSocket', value: '/health 200', state: 'ok' },
    { name: 'Base PostgreSQL', detail: 'Télémétrie et historique des alertes', value: 1240 + s.tick + ' mesures', state: 'ok' },
    { name: 'Service vision', detail: 'Webcam USB · Python natif sur le laptop serveur', value: ms + ' ms', state: 'ok' },
    { name: 'Service anomalies', detail: 'Isolation Forest + Random Forest chargés', value: 'score ' + fr(last.score, 2), state: 'ok' },
  ];

  return {
    mode: 'mock',
    sensors: 'demo',
    link: 'demo',
    now: s.base + s.tick * SIM_SECS_PER_SAMPLE * 1000,
    secsPerSample: SIM_SECS_PER_SAMPLE,
    samples: s.samples,
    level,
    banner: simBanner(s.scenario, level, s.samples),
    alerts: s.alerts,
    ack: (id) => dispatch({ type: 'ack', id }),
    ackAll: () => dispatch({ type: 'ackAll' }),
    vision,
    videoUrl: null,
    services,
    connected: true,
    actuators: s.act,
    buzz: () => dispatch({ type: 'buzz', auto: false }),
    setLed: (led, mode) => dispatch({ type: 'led', led, mode }),
    toggleAuto: () => dispatch({ type: 'toggleAuto' }),
    commandError: null,
    aiClass: null,
    demo: {
      scenario: s.scenario,
      setScenario: (scenario) => dispatch({ type: 'scenario', scenario }),
      playing: s.playing,
      togglePlay: () => dispatch({ type: 'togglePlay' }),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mode API réelle                                                      */
/* ------------------------------------------------------------------ */
const API_SECS_PER_SAMPLE = 2; // l'ESP publie toutes les 2 s
const REPLAY_SECS_PER_SAMPLE = 1; // rejeu : une ligne du CSV par seconde
const VISION_POLL_MS = 250;
const VISION_RETRY_MS = 2000;
const VISION_STALE_S = 3; // au-delà, detect.py est considéré figé
const MAX_SAMPLES = 600; // 10 min de rejeu (1 s) ou 20 min d’ESP (2 s)

interface Device { online: boolean; rssi: number | null; heap: number | null }

interface ApiState {
  now: number;
  samples: Sample[];
  alerts: Alert[];
  online: boolean;
  device: Device | null;
  services: Record<string, boolean>;
  aiClass: { type: string; proba: number } | null;
  commandError: string | null;
  act: Actuators;
  /** Dernier état de detect.py ; null = service vision injoignable */
  vision: VisionStatus | null;
  replay: Replay | null;
  /** true dès la première mesure de l'ESP : le rejeu s'arrête */
  live: boolean;
}

type ApiAction =
  | { type: 'clock'; now: number }
  | { type: 'ws'; msg: WsMessage }
  | { type: 'alerts'; list: Alert[] }
  | { type: 'link'; online: boolean }
  | { type: 'ack'; id: number }
  | { type: 'ackAll' }
  | { type: 'error'; message: string | null }
  | { type: 'vision'; status: VisionStatus | null }
  | { type: 'replay'; replay: Replay }
  | ActuatorAction;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tsOf = (v: unknown, fallback: number) =>
  typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : typeof v === 'string' ? Date.parse(v) || fallback : fallback;

function apiReducer(s: ApiState, a: ApiAction): ApiState {
  if (isActuator(a)) return { ...s, act: actuatorReducer(s.act, a) };
  switch (a.type) {
    case 'clock': {
      if (s.live || !s.replay) return { ...s, now: a.now };
      const sample = sampleAt(s.replay, s.replay.idx, a.now);
      return {
        ...s, now: a.now,
        replay: { ...s.replay, idx: (s.replay.idx + 1) % s.replay.rows.length },
        samples: [...s.samples, sample].slice(-MAX_SAMPLES),
      };
    }
    case 'replay': return s.live ? s : { ...s, replay: a.replay, samples: replayHistory(a.replay, s.now) };
    case 'vision': return { ...s, vision: a.status };
    case 'link': return { ...s, online: a.online };
    case 'alerts': return { ...s, alerts: a.list };
    case 'ack': return { ...s, alerts: s.alerts.map((x) => (x.id === a.id ? { ...x, acked: true } : x)) };
    case 'ackAll': return { ...s, alerts: s.alerts.map((x) => ({ ...x, acked: true })) };
    case 'error': return { ...s, commandError: a.message };
    case 'ws': {
      const { msg } = a;
      if (msg.kind === 'alert') {
        const al = toAlert(msg.data);
        return { ...s, alerts: [al, ...s.alerts.filter((x) => x.id !== al.id)].slice(0, 50) };
      }
      if (msg.kind === 'telemetry') {
        const d = msg.data;
        // Première vraie mesure : on quitte le rejeu et on repart d'un historique vide
        const history = s.live ? s.samples : [];
        const prev = history[history.length - 1];
        const sample: Sample = {
          ts: tsOf(d.ts, s.now),
          temp: num(d.temperature) ?? prev?.temp ?? 0,
          hum: num(d.humidity) ?? prev?.hum ?? 0,
          gas: num(d.gas) ?? prev?.gas ?? 0,
          score: prev?.score ?? 0,
          presence: Boolean(d.presence ?? d.pir),
        };
        const device: Device = { online: true, rssi: num(d.rssi), heap: num(d.heap) };
        const mb = d.motion_buzzer;
        const act = typeof mb === 'boolean' && mb !== s.act.auto ? { ...s.act, auto: mb } : s.act;
        return { ...s, live: true, samples: [...history, sample].slice(-MAX_SAMPLES), device, act };
      }
      if (msg.kind === 'score') {
        const d = msg.data;
        const score = num(d.score) ?? num(d.iforest);
        const samples = s.samples.slice();
        if (score !== null && samples.length) samples[samples.length - 1] = { ...samples[samples.length - 1], score };
        const cls = typeof d.class === 'string' ? d.class : null;
        return { ...s, samples, aiClass: cls ? { type: cls, proba: num(d.proba) ?? 0 } : s.aiClass };
      }
      if (msg.kind === 'status') {
        const d = msg.data;
        const services = typeof d.services === 'object' && d.services ? (d.services as Record<string, boolean>) : s.services;
        return {
          ...s,
          services,
          device: { online: d.online !== false, rssi: num(d.rssi) ?? s.device?.rssi ?? null, heap: num(d.heap) ?? s.device?.heap ?? null },
        };
      }
      return s;
    }
  }
}

const ALERT_TITLE: Record<string, [string, string]> = {
  // [titre warning, titre critique]
  intrusion: ['Présence suspectée', 'Intrusion confirmée'],
  overheat: ['Dérive thermique détectée', 'Surchauffe : niveau critique atteint'],
  gas_leak: ['Micro-déviation de gaz détectée', 'Fuite de gaz : niveau critique'],
  anomaly: ['Anomalie détectée', 'Anomalie critique'],
  device_offline: ['Boîtier instable', 'Boîtier hors ligne'],
};

const OBJECT_LABEL: Record<string, string> = {
  knife: 'couteau', scissors: 'ciseaux', 'baseball bat': 'batte',
  'cell phone': 'téléphone', backpack: 'sac à dos', handbag: 'sac à main', suitcase: 'valise', laptop: 'ordinateur',
};
export const objectLabel = (label: string) => OBJECT_LABEL[label] ?? label;
const durationText = (secs: number) =>
  secs < 60 ? Math.round(secs) + ' s' : Math.floor(secs / 60) + ' min ' + String(Math.round(secs % 60)).padStart(2, '0') + ' s';

function apiBanner(alerts: Alert[], device: Device | null, vision: VisionState, last: Sample | undefined, replay: boolean): Banner {
  const open = alerts.filter((a) => !a.acked);
  const crit = open.find((a) => a.severity === 'critical');
  const banner = (a: Alert): Banner => {
    const lvl: Level = SEVERITY_LEVEL[a.severity];
    const title = ALERT_TITLE[a.type]?.[lvl === 'crit' ? 1 : 0] ?? 'Alerte';
    return { level: lvl, kicker: lvl === 'crit' ? 'CRITIQUE' : 'ATTENTION', title, sub: a.message };
  };
  // Ce que la caméra voit en ce moment passe en premier : visible même sans l'API
  if (vision.threat && vision.objects.length) {
    const top = vision.objects.reduce((a, b) => (b.conf > a.conf ? b : a));
    return {
      level: 'crit', kicker: 'CRITIQUE · CAMÉRA', title: 'Objet dangereux détecté',
      sub: 'cam-01 : ' + objectLabel(top.label) + ' tenu par une personne, confiance ' + fr(top.conf, 2) + '.',
    };
  }
  if (crit) return banner(crit);
  if (vision.abandoned) {
    const bag = vision.infoObjects.find((o) => ['backpack', 'handbag', 'suitcase'].includes(o.label));
    return {
      level: 'warn', kicker: 'ATTENTION · CAMÉRA', title: 'Objet abandonné',
      sub: 'cam-01 : ' + objectLabel(bag?.label ?? 'sac') + ' sans personne à proximité depuis ' + durationText(vision.abandonedSecs) + '.',
    };
  }
  if (vision.loitering) {
    return {
      level: 'warn', kicker: 'ATTENTION · CAMÉRA', title: 'Présence prolongée',
      sub: 'Une personne est devant cam-01 depuis ' + durationText(vision.presentSecs) + '.',
    };
  }
  if (vision.person && vision.confirmFrames >= vision.confirmNeeded) {
    return {
      level: 'warn', kicker: 'ATTENTION · CAMÉRA', title: 'Présence détectée',
      sub: 'cam-01 : personne détectée, confiance ' + fr(vision.conf, 2) + '. Le PIR confirmera l’intrusion.',
    };
  }
  const warn = open.find((a) => a.severity === 'warning');
  if (warn) return banner(warn);
  if (last && last.score >= 0.5) {
    return {
      level: 'warn', kicker: 'ATTENTION · IA', title: 'Anomalie détectée par l’IA',
      sub: 'Score ' + fr(last.score, 2) + ', au-dessus du seuil appris de 0,5' + (replay ? ' · capteurs en rejeu du jeu de données IA' : '') + '.',
    };
  }
  const sub = device?.online
    ? 'Boîtier en ligne · aucune alerte ouverte'
    : replay ? 'Capteurs : rejeu du jeu de données IA en attendant l’ESP · aucune alerte ouverte' : 'En attente des données du boîtier';
  return { level: 'ok', kicker: 'NORMAL', title: 'Tout est normal', sub };
}

function apiVision(st: VisionStatus | null): VisionState {
  if (!st) {
    return {
      online: false, person: false, conf: 0, ms: null, fps: null, confirmFrames: 0, confirmNeeded: 3, bbox: null,
      objects: [], infoObjects: [], abandoned: false, abandonedSecs: 0,
      threat: false, presentSecs: 0, loitering: false, frame: [640, 480], camera: null,
    };
  }
  return {
    online: true,
    person: st.person,
    conf: st.confidence,
    ms: Math.round(st.total_ms),
    fps: Math.round(st.fps),
    confirmFrames: st.confirm,
    confirmNeeded: st.confirm_needed,
    bbox: st.person ? st.bbox : null,
    objects: (st.objects ?? []).map((o) => ({ label: o.label, conf: o.confidence, bbox: o.bbox })),
    infoObjects: (st.info_objects ?? []).map((o) => ({ label: o.label, conf: o.confidence, bbox: o.bbox })),
    abandoned: Boolean(st.abandoned),
    abandonedSecs: st.abandoned_s ?? 0,
    threat: Boolean(st.threat),
    presentSecs: st.present_s ?? 0,
    loitering: Boolean(st.loitering),
    frame: [st.width, st.height],
    camera: st.camera,
  };
}

function useApiSource(): Sentinel {
  const [s, dispatch] = useReducer(apiReducer, undefined, (): ApiState => ({
    now: Date.now(), samples: [], alerts: [], online: false, device: null, services: {},
    aiClass: null, commandError: null, act: initialActuators, vision: null, replay: null, live: false,
  }));
  const onlineRef = useRef(false);

  // Horloge, historique initial des alertes, puis WebSocket avec repli en polling
  useEffect(() => {
    let alive = true;
    const load = () => fetchAlerts().then((list) => { if (alive) dispatch({ type: 'alerts', list }); }).catch(() => {});
    load();
    const clock = window.setInterval(() => dispatch({ type: 'clock', now: Date.now() }), 1000);
    const poll = window.setInterval(() => { if (!onlineRef.current) load(); }, 5000);
    const close = connectSocket(
      (msg) => dispatch({ type: 'ws', msg }),
      (online) => { onlineRef.current = online; dispatch({ type: 'link', online }); },
    );
    return () => { alive = false; window.clearInterval(clock); window.clearInterval(poll); close(); };
  }, []);

  // Capteurs : rejeu du jeu de données IA tant que l'ESP n'a rien envoyé
  useEffect(() => {
    let alive = true;
    loadReplay()
      .then((replay) => { if (alive) dispatch({ type: 'replay', replay }); })
      .catch(() => {}); // sans CSV, les tuiles attendent simplement l'ESP
    return () => { alive = false; };
  }, []);

  // Caméra : état de detect.py, 4 fois par seconde ; toutes les 2 s tant qu'il ne répond pas
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const poll = () => {
      fetchVisionStatus()
        .then((st) => (Date.now() / 1000 - st.ts < VISION_STALE_S ? st : null))
        .catch(() => null)
        .then((status) => {
          if (!alive) return;
          dispatch({ type: 'vision', status });
          timer = window.setTimeout(poll, status ? VISION_POLL_MS : VISION_RETRY_MS);
        });
    };
    poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);
  useBuzzTimer(s.act, dispatch);

  const send = (cmd: Command) =>
    sendCommand(cmd)
      .then(() => dispatch({ type: 'error', message: null }))
      .catch((e: Error) => dispatch({ type: 'error', message: 'Commande non transmise : ' + e.message }));

  const replaying = !s.live && s.replay !== null;
  const vision = apiVision(s.vision);
  const last = s.samples[s.samples.length - 1];
  const banner = apiBanner(s.alerts, s.device, vision, last, replaying);
  const svc = (key: string): ServiceRow['state'] => (key in s.services ? (s.services[key] ? 'ok' : 'down') : 'unknown');
  const services: ServiceRow[] = [
    {
      name: 'ESP8266 sx-001', detail: 'Télémétrie MQTTS toutes les 2 s',
      value: s.device?.rssi != null ? 'RSSI ' + fr(s.device.rssi, 0) + ' dBm' : replaying ? 'en attente · rejeu CSV' : '—',
      state: s.device ? (s.device.online ? 'ok' : 'down') : 'unknown',
    },
    { name: 'Broker Mosquitto', detail: 'Port 8883 · TLS 1.2 · comptes et ACL', value: svc('mosquitto') === 'ok' ? 'en ligne' : '—', state: svc('mosquitto') },
    { name: 'API FastAPI', detail: 'POST /api/v1/alerts · WebSocket', value: s.online ? 'WebSocket ouvert' : 'reconnexion…', state: s.online ? 'ok' : 'down' },
    { name: 'Base PostgreSQL', detail: 'Télémétrie et historique des alertes', value: svc('db') === 'ok' ? 'en ligne' : '—', state: svc('db') },
    {
      name: 'Service vision', detail: 'ai/vision/detect.py · caméra ' + (vision.camera ?? '—') + ' · YOLOv8n ONNX',
      value: vision.online ? vision.ms + ' ms · ' + vision.fps + ' FPS' : 'arrêté', state: vision.online ? 'ok' : 'down',
    },
    replaying
      ? { name: 'Service anomalies', detail: 'Rejeu de sensor_data.csv · score = écart au régime normal', value: last ? 'score ' + fr(last.score, 2) : '—', state: 'unknown' }
      : { name: 'Service anomalies', detail: 'Isolation Forest + Random Forest chargés', value: last ? 'score ' + fr(last.score, 2) : '—', state: svc('anomaly') },
  ];

  return {
    mode: 'api',
    sensors: s.live ? 'esp' : replaying ? 'replay' : 'none',
    link: s.online ? 'online' : 'connecting',
    now: s.now,
    secsPerSample: s.live ? API_SECS_PER_SAMPLE : REPLAY_SECS_PER_SAMPLE,
    samples: s.samples,
    level: banner.level,
    banner,
    alerts: s.alerts,
    ack: (id) => {
      dispatch({ type: 'ack', id });
      ackAlert(id).catch((e: Error) => dispatch({ type: 'error', message: 'Acquittement non enregistré : ' + e.message }));
    },
    ackAll: () => {
      s.alerts.filter((a) => !a.acked).forEach((a) => { ackAlert(a.id).catch(() => {}); });
      dispatch({ type: 'ackAll' });
    },
    vision,
    videoUrl: vision.online ? videoUrl() : null,
    services,
    connected: Boolean(s.device?.online),
    actuators: s.act,
    buzz: () => { dispatch({ type: 'buzz', auto: false }); send({ target: 'buzzer', action: 'pulse', ms: BUZZ_MS }); },
    setLed: (led: LedId, mode: LedMode) => {
      dispatch({ type: 'led', led, mode });
      send({ target: led === 'red' ? 'led_red' : 'led_green', action: mode });
    },
    toggleAuto: () => {
      dispatch({ type: 'toggleAuto' });
      send({ target: 'auto', action: s.act.auto ? 'off' : 'on' });
    },
    commandError: s.commandError,
    aiClass: s.aiClass,
    demo: null,
  };
}

export const DATA_SOURCE: 'mock' | 'api' = import.meta.env.VITE_DATA_SOURCE === 'mock' ? 'mock' : 'api';
export const useSentinel = DATA_SOURCE === 'api' ? useApiSource : useMockSource;
