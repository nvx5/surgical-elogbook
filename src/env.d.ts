/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  /** Shown in Add case AI helper; set to match your AIML_MODEL edge secret (e.g. gpt-4o-mini). */
  readonly PUBLIC_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
