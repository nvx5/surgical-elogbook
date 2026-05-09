/**
 * Deletes the authenticated Supabase Auth user (service role).
 * CASCADE removes public.users and public.cases (FK to auth.users).
 *
 * Deploy: supabase functions deploy delete-auth-user --project-ref <your-project-ref>
 * Requires JWT (verify_jwt in config.toml); anon + user Bearer token sent by supabase-js.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const baseCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS')?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function corsHeadersForOrigin(origin: string | null): Record<string, string> {
  if (!origin) return baseCorsHeaders;
  const configured = parseAllowedOrigins();
  // Safe defaults for local development if ALLOWED_ORIGINS is unset.
  const defaults = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
  const allowlist = configured.length > 0 ? new Set(configured) : defaults;
  if (!allowlist.has(origin)) return baseCorsHeaders;
  return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': origin };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersForOrigin(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = corsHeadersForOrigin(origin);
  if (req.method === 'OPTIONS') {
    if (origin && !corsHeaders['Access-Control-Allow-Origin']) {
      return new Response('origin not allowed', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (origin && !corsHeaders['Access-Control-Allow-Origin']) {
    return json({ error: 'Origin not allowed' }, 403, origin);
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header' }, 401, origin);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Server configuration incomplete' }, 500, origin);
    }

    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await asUser.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Invalid or expired session' }, 401, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return json({ error: delErr.message }, 400, origin);
    }

    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, origin);
  }
});
