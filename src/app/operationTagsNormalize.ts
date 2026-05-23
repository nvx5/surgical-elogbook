/**
 * Normalises AI / pasted operative-note style procedure lists into case tags.
 * Keep server-side logic in `supabase/functions/case-ai-autofill/index.ts` aligned with this file.
 */

const TAG_ACRONYMS_UPPER = new Map<string, string>([
  ['apr', 'APR'],
  ['evar', 'EVAR'],
  ['orif', 'ORIF'],
  ['turp', 'TURP'],
  ['turbt', 'TURBT'],
]);

/** Split UK-style "a + b + c" segments (operative note shorthand). */
export function splitOnProcedurePlus(text: string): string[] {
  return text
    .split(/\s*\+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeSingleOperationTag(raw: string): string {
  let t = raw.trim().replace(/\s+/g, ' ');
  t = t.replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/\s+(procedure|operation)\s*$/i, '').trim();
  const lower = t.toLowerCase();
  return TAG_ACRONYMS_UPPER.get(lower) ?? lower;
}

/**
 * Accepts model output: string[], a single combined string, or null.
 * Splits on `+`, commas, semicolons; strips redundant "procedure"/"operation"; dedupes case-insensitively.
 */
export function normalizeOperationTagsFromAi(raw: unknown): string[] | null {
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
