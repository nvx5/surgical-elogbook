import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const options = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} as const;

let singleton: SupabaseClient | null = null;

/** Returns null if public env vars are missing (safe before hooks). */
export function initSupabase(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (!singleton) {
    singleton = createClient(url, anon, options);
  }
  return singleton;
}

export function getSupabase(): SupabaseClient {
  const c = initSupabase();
  if (!c) {
    throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
  }
  return c;
}
