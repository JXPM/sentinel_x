// Rejeu du jeu de données capteurs de la filière IA (ai/anomalies/data/sensor_data.csv,
// copié dans public/replay/). Il alimente les tuiles et les courbes tant que l'ESP8266
// n'envoie rien sur le WebSocket ; la première vraie mesure le remplace.
import type { Sample } from '../types';

export const REPLAY_URL = '/replay/sensor_data.csv';
/** Le CSV a une mesure toutes les 5 s ; le rejeu en lit une par seconde. */
export const REPLAY_SPEEDUP = 5;
/** Lignes 0-699 : régime normal, conseillé pour l'apprentissage par la filière IA. */
const TRAIN_ROWS = 700;
/** Le rejeu démarre ici : la dérive température + gaz (ligne 750) arrive après ~2 min. */
export const REPLAY_START = 640;
const HISTORY = 120;

export interface ReplayRow { temp: number; hum: number; gas: number; presence: boolean }

export interface Replay {
  rows: ReplayRow[];
  idx: number;
  /** Moyenne et écart-type de chaque capteur sur les lignes normales */
  base: Record<'temp' | 'hum' | 'gas', [number, number]>;
}

export async function loadReplay(): Promise<Replay> {
  const res = await fetch(REPLAY_URL);
  if (!res.ok) throw new Error('GET ' + REPLAY_URL + ' → ' + res.status);
  const [header, ...lines] = (await res.text()).trim().split(/\r?\n/);
  const col = header.split(',');
  const at = (name: string) => col.indexOf(name);
  const iT = at('temperature'), iH = at('humidity'), iG = at('gas'), iP = at('presence');
  // expected_scenario est ignorée : c'est la réponse attendue, réservée à l'évaluation
  const rows = lines.map((l) => {
    const c = l.split(',');
    return { temp: Number(c[iT]), hum: Number(c[iH]), gas: Number(c[iG]), presence: c[iP] === 'true' };
  }).filter((r) => Number.isFinite(r.temp) && Number.isFinite(r.hum) && Number.isFinite(r.gas));
  if (rows.length < TRAIN_ROWS + HISTORY) throw new Error('jeu de données trop court');

  const stats = (pick: (r: ReplayRow) => number): [number, number] => {
    const v = rows.slice(0, TRAIN_ROWS).map(pick);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    return [mean, sd || 1];
  };
  return { rows, idx: REPLAY_START, base: { temp: stats((r) => r.temp), hum: stats((r) => r.hum), gas: stats((r) => r.gas) } };
}

/**
 * Score d'anomalie 0..1 en attendant le service anomalies : plus grand écart au régime
 * normal, en écarts-types. 0,5 = 6 σ ; aucun faux positif sur les 750 lignes normales.
 */
function score(r: ReplayRow, base: Replay['base']): number {
  const z = Math.max(
    Math.abs(r.temp - base.temp[0]) / base.temp[1],
    Math.abs(r.hum - base.hum[0]) / base.hum[1],
    Math.abs(r.gas - base.gas[0]) / base.gas[1],
  );
  return Math.min(1, Math.max(0, (z - 3) / 6));
}

export function sampleAt(rp: Replay, idx: number, ts: number): Sample {
  const r = rp.rows[((idx % rp.rows.length) + rp.rows.length) % rp.rows.length];
  return { ts, temp: r.temp, hum: r.hum, gas: r.gas, presence: r.presence, score: score(r, rp.base) };
}

/** Historique affiché au chargement : les 120 lignes qui précèdent le point de départ. */
export function replayHistory(rp: Replay, now: number): Sample[] {
  const out: Sample[] = [];
  for (let k = HISTORY; k > 0; k--) out.push(sampleAt(rp, rp.idx - k, now - k * 1000));
  return out;
}
