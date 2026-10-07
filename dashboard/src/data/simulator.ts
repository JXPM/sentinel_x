// Simulation de démonstration : reproduit exactement les scénarios de la maquette.
// 1 s affichée = 5 s simulées. Tout est pur (bruit dérivé du numéro d'échantillon),
// ce qui rend le reducer compatible avec le StrictMode de React.
import { etaText } from '../lib/format';
import { GAS_REF, TEMP_REF } from '../lib/levels';
import type { Alert, Banner, Level, Sample, Scenario } from '../types';
import { etaLabel, forecast } from './forecast';

export const SIM_SECS_PER_SAMPLE = 5;
const SEED = 20261006;

function rng(seed: number) {
  let s = seed;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simSample(scn: Scenario, k: number, tick: number, ts: number): Sample {
  const r = rng(SEED + tick * 7919);
  const noise = (amp: number) => (r() - 0.5) * 2 * amp;
  const w = Math.sin(tick / 18);
  let temp = 24 + 0.25 * w + noise(0.12);
  let hum = 55 - 0.5 * w + noise(0.4);
  let gas = 120 + 2 * w + noise(2.2);
  let score = 0.12 + noise(0.03);
  let presence = false;
  const p = Math.min(k / 30, 2.3);
  if (scn === 'overheat') { temp += 9 * p; hum -= 5 * Math.min(p, 1.6); gas += 8 * p; score += 0.52 * Math.min(p, 1.6); }
  if (scn === 'gas') { gas += 135 * p; temp += 0.5 * p; score += 0.5 * Math.min(p, 1.6); }
  if (scn === 'intrusion') { presence = true; score += 0.03; }
  return { ts, temp, hum, gas, score: Math.max(0.02, Math.min(0.98, score)), presence };
}

export function simLevel(scn: Scenario, k: number, s: Sample): Level {
  if (scn === 'intrusion') return k >= 2 ? 'crit' : 'warn';
  if (scn === 'overheat') return s.temp >= TEMP_REF ? 'crit' : s.score >= 0.5 ? 'warn' : 'ok';
  if (scn === 'gas') return s.gas >= GAS_REF ? 'crit' : s.score >= 0.5 ? 'warn' : 'ok';
  return 'ok';
}

/** 14:00:00 aujourd'hui : l'horloge simulée démarre à 14:10:00 (120 échantillons d'historique). */
export function simBase(): number {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  return d.getTime();
}

const at = (base: number, h: number, m: number, s: number) => {
  const d = new Date(base);
  d.setHours(h, m, s, 0);
  return d.toISOString();
};

export function initialAlerts(base: number): Alert[] {
  return [
    { id: 3, ts: at(base, 13, 42, 10), source: 'vision', type: 'intrusion', severity: 'warning', message: 'Personne détectée (confiance 0,81)', dev: 'cam-01', confidence: 0.81, acked: true },
    { id: 2, ts: at(base, 11, 5, 47), source: 'anomaly', type: 'gas_leak', severity: 'warning', message: 'Micro-déviation de gaz, revenue à la normale', dev: 'sx-001', acked: true },
    { id: 1, ts: at(base, 8, 15, 2), source: 'device', type: 'device_offline', severity: 'critical', message: 'ESP hors ligne pendant 42 s', dev: 'sx-001', acked: true },
  ];
}

export interface StepResult {
  newAlerts: Omit<Alert, 'id' | 'ts' | 'acked'>[];
  fired: string[];
  autoBuzz: boolean;
}

/** Alertes que le pas de simulation doit émettre (chaque clé n'est émise qu'une fois par scénario). */
export function simAlerts(scn: Scenario, lvl: Level, samples: Sample[], fired: Record<string, boolean>, auto: boolean): StepResult {
  const res: StepResult = { newAlerts: [], fired: [], autoBuzz: false };
  const eta = (() => {
    const f = forecast(samples, SIM_SECS_PER_SAMPLE);
    return f.next ? etaText(f.next.secs) : 'bientôt';
  })();
  const add = (key: string, a: Omit<Alert, 'id' | 'ts' | 'acked'>) => {
    if (fired[key] || res.fired.includes(key)) return;
    res.fired.push(key);
    res.newAlerts.push(a);
  };
  if (scn === 'overheat' && lvl !== 'ok') add('oh-w', { source: 'anomaly', type: 'overheat', severity: 'warning', dev: 'sx-001', message: 'Dérive thermique : incident estimé dans ' + eta });
  if (scn === 'overheat' && lvl === 'crit') add('oh-c', { source: 'anomaly', type: 'overheat', severity: 'critical', dev: 'sx-001', message: 'Température au-dessus de la référence de 40 °C' });
  if (scn === 'gas' && lvl !== 'ok') add('gs-w', { source: 'anomaly', type: 'gas_leak', severity: 'warning', dev: 'sx-001', message: 'Micro-déviation de gaz : incident estimé dans ' + eta });
  if (scn === 'gas' && lvl === 'crit') add('gs-c', { source: 'anomaly', type: 'gas_leak', severity: 'critical', dev: 'sx-001', message: 'Indice de gaz au-dessus de la référence de 400' });
  if (scn === 'intrusion') add('in-w', { source: 'vision', type: 'intrusion', severity: 'warning', dev: 'cam-01', confidence: 0.87, message: 'Personne détectée (confiance 0,87)' });
  if (scn === 'intrusion' && lvl === 'crit') {
    add('in-c', { source: 'fusion', type: 'intrusion', severity: 'critical', dev: 'sx-001', message: 'Le PIR et la caméra concordent' });
    if (auto && !fired['in-buzz']) { res.fired.push('in-buzz'); res.autoBuzz = true; }
  }
  return res;
}

export function simBanner(scn: Scenario, lvl: Level, samples: Sample[]): Banner {
  const f = forecast(samples, SIM_SECS_PER_SAMPLE);
  const eta = etaLabel(f);
  const b = (kicker: string, title: string, sub: string): Banner => ({ level: lvl, kicker, title, sub });
  switch (scn) {
    case 'overheat':
      if (lvl === 'crit') return b('CRITIQUE', 'Surchauffe : niveau critique atteint', 'Température au-dessus de la référence de 40 °C. Intervention requise.');
      if (lvl === 'warn') return b('ATTENTION · PRÉVISION', 'Dérive thermique détectée', 'Incident estimé dans ' + eta + ' si la tendance continue.');
      return b('NORMAL · SURVEILLANCE', 'Tout est normal', 'L’IA observe une légère hausse de température, encore dans la normale.');
    case 'gas':
      if (lvl === 'crit') return b('CRITIQUE', 'Fuite de gaz : niveau critique', 'Indice de gaz au-dessus de la référence de 400. Aérer et intervenir.');
      if (lvl === 'warn') return b('ATTENTION · PRÉVISION', 'Micro-déviation de gaz détectée', 'Incident estimé dans ' + eta + ' si la tendance continue.');
      return b('NORMAL · SURVEILLANCE', 'Tout est normal', 'L’IA observe une légère hausse du gaz, encore dans la normale.');
    case 'intrusion':
      if (lvl === 'crit') return b('CRITIQUE · INTRUSION', 'Intrusion confirmée', 'Le PIR et la caméra concordent : personne détectée, confiance 0,87.');
      return b('ATTENTION', 'Présence suspectée', 'Un seul capteur a réagi. Confirmation en cours.');
    default:
      return b('NORMAL', 'Tout est normal', '4 capteurs en ligne · dernière mesure il y a 1 s · aucun incident prévu');
  }
}
