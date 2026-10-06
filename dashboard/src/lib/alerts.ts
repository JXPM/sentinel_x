import type { Alert, Level } from '../types';
import { timeOf } from './format';
import { LEVEL_BORDER, LEVEL_COLOR, LEVEL_TINT, SEVERITY_LEVEL } from './levels';

const TITLES: Record<string, string> = {
  intrusion: 'Intrusion',
  overheat: 'Surchauffe',
  gas_leak: 'Fuite de gaz',
  device_offline: 'Capteur hors ligne',
  anomaly: 'Anomalie',
};

export interface AlertView {
  title: string;
  level: Level;
  color: string;
  bg: string;
  border: string;
  opacity: number;
  meta: string;
}

export function alertView(a: Alert): AlertView {
  const level = SEVERITY_LEVEL[a.severity];
  const base = a.source === 'fusion' ? 'Intrusion confirmée' : TITLES[a.type] ?? 'Alerte';
  return {
    title: base + (a.severity === 'critical' ? ' · critique' : ''),
    level,
    color: LEVEL_COLOR[level],
    bg: a.acked ? 'var(--card-muted)' : LEVEL_TINT[level],
    border: a.acked ? 'var(--line)' : LEVEL_BORDER[level],
    opacity: a.acked ? 0.78 : 1,
    meta: timeOf(a.ts) + ' · ' + a.source + ' · ' + a.dev,
  };
}

export const unackedLabel = (n: number) =>
  n === 0 ? 'tout est acquitté' : n + (n > 1 ? ' alertes à traiter' : ' alerte à traiter');
