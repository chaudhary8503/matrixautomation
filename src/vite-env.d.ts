/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Set by scripts/prerender.mjs while taking HTML snapshots. */
  __PRERENDER__?: boolean;
  /** Set while prerendering: returns the dehydrated public React Query cache. */
  __RQ_DEHYDRATE__?: () => unknown;
}
