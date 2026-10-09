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

// Raison précise envoyée par la vision (data.reason) : plus parlante que le type seul
const REASON_TITLES: Record<string, string> = {
  danger_object: 'Objet dangereux',
  loitering: 'Présence prolongée',
  abandoned: 'Objet abandonné',
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
  const reason = typeof a.data?.reason === 'string' ? a.data.reason : '';
  const base = a.source === 'fusion' ? 'Intrusion confirmée'
    : REASON_TITLES[reason] ?? (a.data?.off_hours === true && a.type === 'intrusion' ? 'Présence hors horaires' : TITLES[a.type] ?? 'Alerte');
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
