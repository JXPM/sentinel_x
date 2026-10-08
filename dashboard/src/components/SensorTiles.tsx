import { fr, pathOf, spark, timeOf } from '../lib/format';
import { GAS_REF, LEVEL_BORDER, LEVEL_COLOR, TEMP_REF } from '../lib/levels';
import { forecast, rising } from '../data/forecast';
import type { Sentinel } from '../types';
import { Icon, type IconName } from './Icon';

type ChipKind = 'stable' | 'rising' | 'crit' | 'calm' | 'motion';
const CHIPS: Record<ChipKind, { label: string; color: string; border: string }> = {
  stable: { label: 'stable', color: 'var(--text-2)', border: 'var(--line-strong)' },
  rising: { label: 'en hausse', color: LEVEL_COLOR.warn, border: LEVEL_BORDER.warn },
  crit: { label: 'critique', color: LEVEL_COLOR.crit, border: LEVEL_BORDER.crit },
  calm: { label: 'calme', color: 'var(--text-2)', border: 'var(--line-strong)' },
  motion: { label: 'mouvement', color: LEVEL_COLOR.crit, border: LEVEL_BORDER.crit },
};

interface Tile {
  label: string;
  icon: IconName;
  color: string;
  value: string;
  unit: string;
  spark: string;
  foot: string;
  chip: ChipKind;
  alarm: boolean;
}

const trend = (d: number, unit: string, eps: number, dec: number) =>
  Math.abs(d) < eps ? 'stable sur 5 min' : (d > 0 ? '+' : '') + fr(d, dec) + ' ' + unit + ' en 5 min';

export function SensorTiles({ s }: { s: Sentinel }) {
  const { samples, secsPerSample } = s;
  if (samples.length === 0) {
    return <p className="empty">En attente des premières mesures du boîtier…</p>;
  }
  const last = samples[samples.length - 1];
  const ago = samples[Math.max(0, samples.length - 1 - Math.round(300 / secsPerSample))];
  const recent = samples.slice(-Math.round(200 / secsPerSample));
  const f = forecast(samples, secsPerSample);
  const tState: ChipKind = last.temp >= TEMP_REF ? 'crit' : rising(f, 'temp', secsPerSample) ? 'rising' : 'stable';
  const gasPpm = last.gasUnit === 'ppm';
  const gState: ChipKind = last.gas >= GAS_REF ? 'crit' : rising(f, 'gas', secsPerSample) ? 'rising' : 'stable';
  const lastMotion = [...samples].reverse().find((x) => x.presence);

  const tiles: Tile[] = [
    { label: 'Température', icon: 'thermometer', color: 'var(--temp)', value: fr(last.temp, 1), unit: '°C', spark: spark(recent.map((x) => x.temp)), foot: trend(last.temp - ago.temp, '°C', 0.3, 1), chip: tState, alarm: tState === 'crit' },
    { label: 'Humidité', icon: 'droplet', color: 'var(--hum)', value: fr(last.hum, 0), unit: '%', spark: spark(recent.map((x) => x.hum)), foot: trend(last.hum - ago.hum, '%', 1, 0), chip: 'stable', alarm: false },
    { label: 'Gaz', icon: 'flame', color: 'var(--brand)', value: gasPpm && last.gas < 10 ? last.gas.toFixed(1).replace('.', ',') : String(Math.round(last.gas)), unit: gasPpm ? 'ppm' : 'indice', spark: spark(recent.map((x) => x.gas)), foot: trend(last.gas - ago.gas, gasPpm ? 'ppm' : 'pts', 6, gasPpm ? 1 : 0), chip: gState, alarm: gState === 'crit' },
    {
      label: 'Présence (PIR)', icon: 'eye', color: 'var(--text)', value: last.presence ? 'Oui' : 'Non', unit: '',
      spark: pathOf(recent.map((x) => (x.presence ? 1 : 0)), -0.2, 1.2, 200, 40),
      foot: last.presence ? 'mouvement détecté à ' + timeOf(s.now) : lastMotion ? 'dernier mouvement à ' + timeOf(lastMotion.ts) : 'aucun mouvement depuis 10 min',
      chip: last.presence ? 'motion' : 'calm', alarm: last.presence,
    },
  ];

  return (
    <section className="tiles" id="capteurs" aria-label="Capteurs">
      {tiles.map((t) => {
        const chip = CHIPS[t.chip];
        return (
          <div key={t.label} className="tile" style={{ borderColor: t.alarm ? LEVEL_BORDER.crit : undefined }}>
            <div className="tile-head">
              <span className="tile-label"><Icon name={t.icon} size={18} stroke={t.color} />{t.label}</span>
              <span className="tile-chip" style={{ color: chip.color, borderColor: chip.border }}>{chip.label}</span>
            </div>
            <div className="tile-value"><strong>{t.value}</strong><span>{t.unit}</span></div>
            <svg className="spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
              <path d={t.spark} fill="none" stroke={t.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="tile-foot">{t.foot}</span>
          </div>
        );
      })}
    </section>
  );
}
