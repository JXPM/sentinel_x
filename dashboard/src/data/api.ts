// Client de l'API Sentinel-X. Contrat : docs/02 - Architecture/API REST et WebSocket.md
import type { Alert, AlertSource, AlertType, Command, Severity } from '../types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

// Le JWT reste en mémoire uniquement (jamais dans localStorage), cf. règles du dashboard.
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

function headers(json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface ApiAlert {
  id: number;
  ts: string;
  source: AlertSource;
  type: AlertType;
  severity: Severity;
  dev: string;
  message: string;
  confidence?: number | null;
  data?: Record<string, unknown>;
  acked_at?: string | null;
}

export const toAlert = (a: ApiAlert): Alert => ({ ...a, acked: Boolean(a.acked_at) });

export async function fetchAlerts(limit = 50): Promise<Alert[]> {
  const list = await request<ApiAlert[]>(`/api/v1/alerts?limit=${limit}`, { headers: headers() });
  // L'API renvoie l'ordre chronologique ; le dashboard affiche le plus récent en premier
  return list.map(toAlert).sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

export const ackAlert = (id: number) =>
  request<void>(`/api/v1/alerts/${id}/ack`, { method: 'PATCH', headers: headers() });

export const sendCommand = (cmd: Command) =>
  request<void>('/api/v1/commands', { method: 'POST', headers: headers(true), body: JSON.stringify(cmd) });

export const videoUrl = () => BASE + '/video';

/** État publié par ai/vision/detect.py (GET /video/status). */
export interface VisionStatus {
  online: boolean;
  camera: string;
  ts: number; // epoch s
  width: number;
  height: number;
  person: boolean;
  alarm: boolean;
  confidence: number;
  bbox: [number, number, number, number] | null;
  confirm: number;
  confirm_needed: number;
  // Champs absents d'un detect.py plus ancien : lus avec une valeur par défaut
  objects?: { label: string; confidence: number; bbox: [number, number, number, number] }[];
  threat?: boolean;
  info_objects?: { label: string; confidence: number; bbox: [number, number, number, number] }[];
  abandoned?: boolean;
  abandoned_s?: number;
  present_s?: number;
  loitering?: boolean;
  infer_ms: number;
  total_ms: number;
  fps: number;
}

export const fetchVisionStatus = () =>
  request<VisionStatus>('/video/status', { signal: AbortSignal.timeout(1500) });

export type WsMessage =
  | { kind: 'telemetry'; data: Record<string, unknown> }
  | { kind: 'alert'; data: ApiAlert }
  | { kind: 'score'; data: Record<string, unknown> }
  | { kind: 'status'; data: Record<string, unknown> };

/**
 * Ouvre /ws et se reconnecte automatiquement (backoff 1 s → 30 s).
 * Renvoie une fonction de fermeture définitive.
 */
export function connectSocket(onMessage: (m: WsMessage) => void, onLink: (online: boolean) => void): () => void {
  let ws: WebSocket | null = null;
  let delay = 1000;
  let timer: number | undefined;
  let closed = false;

  const open = () => {
    const origin = BASE || window.location.origin;
    const url = origin.replace(/^http/, 'ws') + '/ws' + (token ? '?token=' + encodeURIComponent(token) : '');
    ws = new WebSocket(url);
    ws.onopen = () => { delay = 1000; onLink(true); };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        if (msg && typeof msg.kind === 'string') onMessage(msg);
      } catch {
        // message illisible : ignoré
      }
    };
    ws.onclose = () => {
      onLink(false);
      if (closed) return;
      timer = window.setTimeout(open, delay);
      delay = Math.min(delay * 2, 30000);
    };
  };

  open();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
