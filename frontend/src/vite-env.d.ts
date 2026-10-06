/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Unset in development — Vite proxies /api. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}