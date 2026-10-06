import { etaText, slope } from '../lib/format';
import { GAS_REF, TEMP_REF } from '../lib/levels';
import type { Sample } from '../types';

export interface Forecast {
  /** Pente de température en °C par échantillon */
  st: number;
  /** Pente de gaz en points par échantillon */
  sg: number;
  next: { kind: 'temp' | 'gas'; secs: number } | null;
  both: boolean;
}

/** Extrapole la tendance des 2 dernières minutes jusqu'aux références 40 °C et 400. */
export function forecast(samples: Sample[], secsPerSample: number): Forecast {
  if (samples.length === 0) return { st: 0, sg: 0, next: null, both: false };
  const last = samples[samples.length - 1];
  const recent = samples.slice(-Math.max(2, Math.round(120 / secsPerSample)));
  // Seuils de pente exprimés par minute pour être indépendants de la cadence
  const perMin = 60 / secsPerSample;
  const st = slope(recent.map((s) => s.temp));
  const sg = slope(recent.map((s) => s.gas));
  const out: { kind: 'temp' | 'gas'; secs: number }[] = [];
  if (st * perMin > 0.36 && last.temp < TEMP_REF) out.push({ kind: 'temp', secs: ((TEMP_REF - last.temp) / st) * secsPerSample });
  if (sg * perMin > 9.6 && last.gas < GAS_REF) out.push({ kind: 'gas', secs: ((GAS_REF - last.gas) / sg) * secsPerSample });
  out.sort((a, b) => a.secs - b.secs);
  return { st, sg, next: out[0] ?? null, both: out.length > 1 };
}

export const rising = (f: Forecast, kind: 'temp' | 'gas', secsPerSample: number) =>
  (kind === 'temp' ? f.st * (60 / secsPerSample) > 0.36 : f.sg * (60 / secsPerSample) > 9.6);

export const etaLabel = (f: Forecast) => (f.next ? etaText(f.next.secs) : 'quelques minutes');
