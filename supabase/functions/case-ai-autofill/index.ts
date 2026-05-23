/**
 * Natural language → structured case fields for Add case (AIML API, OpenAI-compatible).
 *
 * Secrets: AIML_API_KEY (required), AIML_MODEL (optional, default gpt-4o-mini).
 * Optional: ALLOWED_ORIGINS — comma-separated extra origins (e.g. preview URLs). Built-in list below
 *   already covers localhost (4321/3000) and surgicalelogbook.com; merge with this secret.
 *
 * Deploy: supabase functions deploy case-ai-autofill --project-ref <ref>
 *
 * Dashboard deploy: turn OFF “Verify JWT” for this function (same reason as verify_jwt=false above).
 *
 * Keep SURGICAL_SPECIALTIES / CE_POD / ROLES / OPERATION_TAG_CANONICAL_EXAMPLES in sync with src/app/constants.ts.
 * Keep operation-tag splitting/normalisation aligned with src/app/operationTagsNormalize.ts.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const SURGICAL_SPECIALTIES = [
  'Academic surgery',
  'Cardiothoracic surgery',
  'General surgery',
  'Neurosurgery',
  'Oral and maxillofacial surgery',
  'Otolaryngology',
  'Paediatric surgery',
  'Plastic surgery',
  'Trauma and orthopaedic surgery',
  'Urology',
  'Vascular surgery',
] as const;

const CE_POD_VALUES = ['Immediate', 'Urgent', 'Expedited', 'Elective'] as const;

const ROLES = [
  'Observed',
  'Assisted',
  'Performed part',
  'Performed under supervision',
  'Performed independently',
  'Trainer',
] as const;

/** Same strings as `OPERATION_TAG_SUGGESTIONS` in src/app/constants.ts (order sorted for the prompt). */
const OPERATION_TAG_CANONICAL_EXAMPLES = [
  'laparotomy',
  'adhesiolysis',
  "hartmann's",
  'right hemicolectomy',
  'appendicectomy',
  'laparoscopic cholecystectomy',
  'open cholecystectomy',
  'diagnostic laparoscopy',
  'small bowel resection',
  'anterior resection',
  'APR',
  'EVAR',
  'open AAA repair',
  'fem-pop bypass',
  'inguinal hernia repair',
  'TURP',
  'TURBT',
  'nephrectomy',
  'thyroidectomy',
  'tracheostomy',
  'chest drain',
  'thoracotomy',
  'lobectomy',
  'wound debridement',
  'fasciotomy',
  'amputation',
  'ORIF',
  'dynamic hip screw',
  'total hip replacement',
  'total knee replacement',
].sort((a, b) => a.localeCompare(b));

const TAG_ACRONYMS_UPPER = new Map<string, string>([
  ['apr', 'APR'],
  ['evar', 'EVAR'],
  ['orif', 'ORIF'],
  ['turp', 'TURP'],
  ['turbt', 'TURBT'],
]);

const AIML_BASE = 'https://api.aimlapi.com/v1';

function splitOnProcedurePlus(text: string): string[] {
  return text
    .split(/\s*\+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeSingleOperationTag(raw: string): string {
  let t = raw.trim().replace(/\s+/g, ' ');
  t = t.replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/\s+(procedure|operation)\s*$/i, '').trim();
  const lower = t.toLowerCase();
  return TAG_ACRONYMS_UPPER.get(lower) ?? lower;
}

/** Matches src/app/operationTagsNormalize.ts */
function normalizeOperationTagsFromAi(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  const pieces: string[] = [];
  function pushFromString(s: string) {
    const t = s.trim();
    if (!t) return;
    for (const plusChunk of splitOnProcedurePlus(t)) {
      for (const sub of plusChunk.split(/\s*[,;]\s*/)) {
        const u = sub.trim();
        if (u) pieces.push(u);
      }
    }
  }
  if (typeof raw === 'string') {
    pushFromString(raw);
  } else if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === 'string') pushFromString(x);
    }
  } else {
    return null;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    const norm = normalizeSingleOperationTag(p);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out.length ? out : null;
}

const baseCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

/**
 * CORS allowlist baked into the function (no secret needed for these).
 * Edit here if the prod domain changes. Extra origins: ALLOWED_ORIGINS secret (comma-separated).
 */
const BUILTIN_CORS_ORIGINS = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://surgicalelogbook.com',
  'https://www.surgicalelogbook.com',
] as const;

function corsAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS')?.trim() ?? '';
  const extra = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set<string>([...BUILTIN_CORS_ORIGINS, ...extra])];
}

function corsHeadersForOrigin(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...baseCorsHeaders };
  if (!origin) return headers;

  if (corsAllowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersForOrigin(origin), 'Content-Type': 'application/json' },
  });
}

function buildSystemPrompt(): string {
  return `You extract surgical training logbook fields from spoken or typed free text.

Rules:
- Output a single JSON object only (no markdown, no commentary).
- Use null for any field you cannot infer confidently.
- Never invent patient-identifying details; omit sensitive identifiers from notes entirely.
- **notes**: Clinical-learning reflections only; leave null unless clearly stated by the user. Avoid identifiers.

Exact enums (must match character-for-character when set):
- **specialty** ∈ ${JSON.stringify([...SURGICAL_SPECIALTIES])}
- **cepod** ∈ ${JSON.stringify([...CE_POD_VALUES])}
- **role** ∈ ${JSON.stringify([...ROLES])}

**hospital**: Prefer official UK NHS trust / health board names if you recognise them (plain string). Use null if unknown.

**operationTags**: Array of individual procedures for this logbook entry — NOT one array element that still contains "+" joining multiple procedures.

UK operative notes often combine procedures with plus signs, meaning separate tags. Example: "laparotomy + adhesiolysis + hartmann's procedure" ⇒ THREE tags: "laparotomy", "adhesiolysis", "hartmann's" (drop generic trailing words like "procedure" or "operation" from each segment when they add no meaning).

Rules:
- Split combined procedures on "+", commas, or semicolons into separate array elements (never output one tag string that still contains "+").
- Each tag: concise operative phrase; **lowercase words with spaces** inside the tag (e.g. "laparoscopic cholecystectomy"). Do **not** use snake_case (not "hartmanns_procedure").
- Keep standard acronym tags **uppercase**: APR, EVAR, ORIF, TURP, TURBT (when that is the procedure name).
- When a segment clearly matches a known UK logbook phrase below, use that **exact spelling** (including apostrophe in "hartmann's").
- Preserve sensible operative order (first-mentioned or anatomical sequence) when obvious.
- null only if no procedures are stated.

Canonical tag spellings to prefer when they match: ${JSON.stringify([...OPERATION_TAG_CANONICAL_EXAMPLES])}

**case_date**: ISO date YYYY-MM-DD only if clearly stated or strongly implied (e.g. "today" → user message cannot resolve relative dates without context — use null unless an explicit calendar date appears).

**consultantFirstName**, **consultantLastName**, **consultantGmc**: Only if explicitly mentioned.

JSON shape:
{
  "case_date": string | null,
  "specialty": string | null,
  "hospital": string | null,
  "operationTags": string[] | null,
  "cepod": string | null,
  "role": string | null,
  "notes": string | null,
  "consultantFirstName": string | null,
  "consultantLastName": string | null,
  "consultantGmc": string | null
}`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const t = text.trim();
  try {
    const o = JSON.parse(t);
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        const o = JSON.parse(t.slice(i, j + 1));
        return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalisePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (k: string) => {
    const v = raw[k];
    if (v === null || v === undefined) {
      out[k] = null;
      return;
    }
    if (typeof v === 'string') {
      const t = v.trim();
      out[k] = t ? t : null;
      return;
    }
    out[k] = null;
  };
  str('case_date');
  str('specialty');
  str('hospital');
  str('cepod');
  str('role');
  str('notes');
  str('consultantFirstName');
  str('consultantLastName');
  str('consultantGmc');

  out['operationTags'] = normalizeOperationTagsFromAi(raw['operationTags']);

  return out;
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
    if (!supabaseUrl || !anonKey) {
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

    const apiKey = Deno.env.get('AIML_API_KEY')?.trim();
    if (!apiKey) {
      return json({ error: 'AIML_API_KEY is not configured on the server' }, 500, origin);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, origin);
    }

    const text =
      typeof body === 'object' && body !== null && 'text' in body && typeof (body as { text?: unknown }).text === 'string'
        ? (body as { text: string }).text.trim()
        : '';

    if (!text) {
      return json({ error: 'Missing non-empty "text" field' }, 400, origin);
    }
    if (text.length > 200) {
      return json({ error: 'Text too long (max 200 characters)' }, 400, origin);
    }

    const model = Deno.env.get('AIML_MODEL')?.trim() || 'gpt-4o-mini';

    const aimlRes = await fetch(`${AIML_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: `The trainee describes one procedure/case to log. Extract JSON fields.\n\n---\n${text}\n---`,
          },
        ],
      }),
    });

    if (!aimlRes.ok) {
      const errText = await aimlRes.text().catch(() => '');
      return json(
        {
          error: `AIML request failed (${aimlRes.status})`,
          details: errText.slice(0, 500),
        },
        502,
        origin,
      );
    }

    const aimlJson = (await aimlRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = aimlJson.choices?.[0]?.message?.content ?? '';
    if (!content || typeof content !== 'string') {
      return json({ error: 'Empty model response' }, 502, origin);
    }

    const parsed = extractJsonObject(content);
    if (!parsed) {
      return json({ error: 'Model returned JSON that could not be parsed' }, 502, origin);
    }

    const patch = normalisePatch(parsed);
    return json({ patch }, 200, origin);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, origin);
  }
});
