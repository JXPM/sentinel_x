// Types partagés, alignés sur le contrat de l'API (docs/02 - Architecture/API REST et WebSocket.md)

export type Level = 'ok' | 'warn' | 'crit';

export type AlertSource = 'vision' | 'anomaly' | 'device' | 'fusion';
export type AlertType = 'intrusion' | 'overheat' | 'gas_leak' | 'anomaly' | 'device_offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: number;
  ts: string; // ISO 8601
  source: AlertSource;
  type: AlertType;
  severity: Severity;
  dev: string;
  message: string;
  confidence?: number | null;
  data?: Record<string, unknown>;
  acked: boolean;
}

export interface Sample {
  ts: number; // epoch ms
  temp: number;
  hum: number;
  gas: number;
  gasUnit?: 'ppm' | 'raw'; // ppm dès que le serveur a calibré le MQ-2, sinon lecture brute (démo, avant calibration)
  score: number; // score d'anomalie 0..1
  presence: boolean;
}

export type Scenario = 'nominal' | 'overheat' | 'gas' | 'intrusion';
export type TabId = 'supervision' | 'capteurs' | 'vision' | 'alertes' | 'commandes' | 'regles' | 'systeme';
export type LedId = 'green' | 'red';
export type LedMode = 'auto' | 'on' | 'off';

/** Boîte de détection en pixels de l'image source 640×480 : [x1, y1, x2, y2] */
export type BBox = [number, number, number, number];

/** Objet vu par la caméra (classe COCO, confiance, boîte en pixels source) */
export interface DetectedObject {
  label: string;
  conf: number;
  bbox: BBox;
}

export interface VisionState {
  /** false = service vision injoignable (detect.py arrêté) */
  online: boolean;
  person: boolean;
  conf: number;
  ms: number | null;
  fps: number | null;
  confirmFrames: number;
  confirmNeeded: number;
  bbox: BBox | null;
  /** Objets dangereux tenus par une personne : couteau, ciseaux, batte */
  objects: DetectedObject[];
  /** Objets d'information, sans alerte : téléphone, sacs, valise, ordinateur */
  infoObjects: DetectedObject[];
  /** Sac laissé seul dans le champ plus longtemps que --abandon */
  abandoned: boolean;
  abandonedSecs: number;
  /** Objet dangereux confirmé sur plusieurs images */
  threat: boolean;
  /** Durée de la présence en cours, en secondes */
  presentSecs: number;
  /** Présence plus longue que le seuil réglé dans l'onglet Règles */
  loitering: boolean;
  /** En dehors des heures ouvrées : toute présence passe en critique */
  offHours: boolean;
  /** Taille de l'image source, pour placer la boîte : [largeur, hauteur] */
  frame: [number, number];
  camera: string | null;
}

export interface Banner {
  level: Level;
  kicker: string;
  title: string;
  sub: string;
}

export interface ServiceRow {
  name: string;
  detail: string;
  value: string;
  state: 'ok' | 'down' | 'unknown';
}

export interface Actuators {
  buzzing: boolean;
  buzzAuto: boolean;
  buzzSeq: number;
  leds: Record<LedId, LedMode>;
  auto: boolean;
}

export type Command =
  | { target: 'buzzer'; action: 'pulse'; ms: number }
  | { target: 'led_red' | 'led_green'; action: LedMode }
  | { target: 'auto'; action: 'on' | 'off' }
  | { target: 'lcd'; action: 'text'; text: string; s: number };

/* Réglages de l'onglet « Règles » (GET/PUT /api/v1/settings, app/settings.py) */
export type RuleEvent =
  | 'danger_object' | 'intrusion_confirmed' | 'person' | 'loitering' | 'abandoned'
  | 'motion' | 'off_hours' | 'overheat' | 'gas_leak' | 'anomaly' | 'any_critical';

export interface Rule {
  id?: string;
  name: string;
  event: RuleEvent;
  enabled: boolean;
  buzzer_ms: number;
  lcd_text: string;
  lcd_s: number;
}

export interface Settings {
  vision: { loiter_s: number; abandon_s: number; confirm: number; person_conf: number; obj_conf: number };
  hours: { start: string; end: string; days: number[] };
  rules: { enabled: boolean; cooldown_s: number; items: Rule[] };
}

export interface SettingsResponse {
  settings: Settings;
  defaults: Settings;
  updated_at: string | null;
  updated_by: string | null;
  persisted: boolean;
  vision_sent?: boolean;
}

export interface Sentinel {
  mode: 'mock' | 'api';
  /** Origine des mesures capteurs : simulation, rejeu du CSV de la filière IA, ou ESP8266 */
  sensors: 'demo' | 'replay' | 'esp' | 'none';
  link: 'demo' | 'connecting' | 'online' | 'offline';
  now: number;
  secsPerSample: number;
  samples: Sample[];
  level: Level;
  banner: Banner;
  alerts: Alert[];
  ack: (id: number) => void;
  ackAll: () => void;
  vision: VisionState;
  videoUrl: string | null;
  services: ServiceRow[];
  connected: boolean;
  actuators: Actuators;
  buzz: () => void;
  setLed: (led: LedId, mode: LedMode) => void;
  toggleAuto: () => void;
  /** Affiche un texte quelques secondes sur le LCD 16×2 du boîtier ; résout false si non transmis */
  sendLcd: (text: string, secs: number) => Promise<boolean>;
  commandError: string | null;
  /** Classification fournie par le service anomalies (mode api) ; null = déduite des tendances */
  aiClass: { type: string; proba: number } | null;
  demo: null | {
    scenario: Scenario;
    setScenario: (s: Scenario) => void;
    playing: boolean;
    togglePlay: () => void;
  };
}
