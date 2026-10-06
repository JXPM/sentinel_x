/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (défaut, démo simulée) ou "api" (FastAPI réelle) */
  readonly VITE_DATA_SOURCE?: 'mock' | 'api';
  /** Origine de l'API, ex. https://sentinel.lan ; vide = même origine (proxy Vite ou Caddy) */
  readonly VITE_API_BASE?: string;
}
