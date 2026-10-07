import type { Actuators, LedId, LedMode } from '../types';

export type ActuatorAction =
  | { type: 'buzz'; auto: boolean }
  | { type: 'buzzEnd' }
  | { type: 'led'; led: LedId; mode: LedMode }
  | { type: 'toggleAuto' };

export const initialActuators: Actuators = {
  buzzing: false,
  buzzAuto: false,
  buzzSeq: 0,
  leds: { green: 'auto', red: 'auto' },
  auto: true,
};

export function actuatorReducer(s: Actuators, a: ActuatorAction): Actuators {
  switch (a.type) {
    case 'buzz': return { ...s, buzzing: true, buzzAuto: a.auto, buzzSeq: s.buzzSeq + 1 };
    case 'buzzEnd': return { ...s, buzzing: false };
    case 'led': return { ...s, leds: { ...s.leds, [a.led]: a.mode } };
    case 'toggleAuto': return { ...s, auto: !s.auto };
  }
}

export const BUZZ_MS = 2000;
