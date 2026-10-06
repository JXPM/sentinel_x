import type { LedId, Sentinel } from '../types';
import { LEVEL_COLOR } from './levels';

export interface LedView {
  id: LedId;
  name: string;
  pin: string;
  lit: boolean;
  color: string;
  glow: string;
  hint: string;
}

/**
 * Comportement des deux LEDs du boîtier :
 *  - verte (D0) : allumée fixe tant que l'ESP est connecté au broker MQTTS ;
 *  - rouge (D8) : allumée fixe pendant une alerte, clignotante si le broker est perdu.
 */
export function ledViews(s: Sentinel): LedView[] {
  const alertActive = s.level !== 'ok';
  const def = [
    { id: 'green' as const, name: 'LED verte', pin: 'D0', color: LEVEL_COLOR.ok, glow: 'rgba(52,211,166,.7)', autoOn: s.connected, on: 'allumée fixe : boîtier connecté au broker MQTTS', off: 'éteinte : broker injoignable' },
    { id: 'red' as const, name: 'LED rouge', pin: 'D8', color: LEVEL_COLOR.crit, glow: 'rgba(255,92,122,.7)', autoOn: alertActive, on: 'allumée fixe : alerte en cours', off: 'éteinte : aucune alerte · clignote si le broker est perdu' },
  ];
  return def.map((d) => {
    const mode = s.actuators.leds[d.id];
    const lit = mode === 'on' || (mode === 'auto' && d.autoOn);
    const hint = mode === 'auto' ? 'Auto · ' + (d.autoOn ? d.on : d.off) : mode === 'on' ? 'Forcée allumée depuis le dashboard' : 'Forcée éteinte depuis le dashboard';
    return { id: d.id, name: d.name, pin: d.pin, lit, color: d.color, glow: d.glow, hint };
  });
}
