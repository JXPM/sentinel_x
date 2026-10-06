export type AlarmState = 'normal' | 'alerte'

export interface ActuatorStatus {
  buzzer: boolean
  led: boolean
}