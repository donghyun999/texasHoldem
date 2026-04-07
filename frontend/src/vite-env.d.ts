/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TOURNAMENT_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
