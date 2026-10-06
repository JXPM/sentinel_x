import type { Level, Severity } from '../types';

// Couleurs d'état de la charte (mêmes valeurs que les tokens CSS --ok/--warn/--crit)
export const LEVEL_COLOR: Record<Level, string> = { ok: '#34D3A6', warn: '#FFB547', crit: '#FF5C7A' };
export const LEVEL_TINT: Record<Level, string> = {
  ok: 'rgba(52,211,166,.08)',
  warn: 'rgba(255,181,71,.09)',
  crit: 'rgba(255,92,122,.10)',
};
export const LEVEL_BORDER: Record<Level, string> = {
  ok: 'rgba(52,211,166,.30)',
  warn: 'rgba(255,181,71,.45)',
  crit: 'rgba(255,92,122,.55)',
};

export const SEVERITY_LEVEL: Record<Severity, Level> = { info: 'ok', warning: 'warn', critical: 'crit' };

// Références de prévision (repères, pas des règles d'alerte : l'alerte vient du modèle IA)
export const TEMP_REF = 40;
export const GAS_REF = 400;
