/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional public origin of the agent backend (data-feed server). Defaults to same-origin via Vite proxy. */
  readonly VITE_AGENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
