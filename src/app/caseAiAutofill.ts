import {
  canonicalCepod,
  resolveCepod,
  resolveRole,
  resolveSpecialty,
} from './constants';
import { normalizeOperationTagsFromAi } from './operationTagsNormalize';
import type { Preferences } from './types';
import { validateNotes } from './utils';
import { canonicalUkTrustName, resolveUkTrustFromLooseName } from './ukNhsTrusts';

/** Normalised payload from `case-ai-autofill` Edge Function. */
export type AiCasePatch = {
  case_date?: string | null;
  specialty?: string | null;
  hospital?: string | null;
  operationTags?: string[] | null;
  cepod?: string | null;
  role?: string | null;
  notes?: string | null;
  consultantFirstName?: string | null;
  consultantLastName?: string | null;
  consultantGmc?: string | null;
};

export type CaseFormSliceForAi = {
  case_date: string;
  specialty: string;
  hospital: string;
  operationTags: string[];
  tagInput: string;
  cepod: string;
  role: string;
  notes: string;
  cFirst: string;
  cLast: string;
  cGmc: string;
};

function isoDateOk(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00`);
  return !Number.isNaN(t);
}

/**
 * Merges AI output into form state. Unknown fields are skipped; invalid notes are rejected with a warning.
 */
export function mergeAiCasePatch(
  prev: CaseFormSliceForAi,
  patch: AiCasePatch,
  prefs: Preferences,
): { next: CaseFormSliceForAi; warnings: string[] } {
  const warnings: string[] = [];
  let next: CaseFormSliceForAi = {
    ...prev,
    tagInput: '',
  };

  if (patch.case_date != null && typeof patch.case_date === 'string') {
    const d = patch.case_date.trim();
    if (d && isoDateOk(d)) next.case_date = d;
    else if (d) warnings.push('AI suggested a date that could not be applied.');
  }

  if (patch.specialty != null && typeof patch.specialty === 'string' && patch.specialty.trim()) {
    next.specialty = resolveSpecialty(patch.specialty, prefs.defaultSpecialty);
  }

  if (patch.hospital != null && typeof patch.hospital === 'string' && patch.hospital.trim()) {
    const raw = patch.hospital.trim();
    const resolved = canonicalUkTrustName(raw) || resolveUkTrustFromLooseName(raw);
    if (resolved) next.hospital = resolved;
    else warnings.push('Trust name from AI did not match an official NHS organisation — left unchanged.');
  }

  const tags = normalizeOperationTagsFromAi(patch.operationTags);
  if (tags !== null && tags.length > 0) {
    next.operationTags = tags;
  }

  if (patch.cepod != null && typeof patch.cepod === 'string' && patch.cepod.trim()) {
    const ce = canonicalCepod(patch.cepod);
    if (ce !== '') next.cepod = ce;
    else {
      const r = resolveCepod(patch.cepod, prefs.defaultCepod);
      if (r !== '') next.cepod = r;
      else warnings.push('CEPOD value from AI was not recognised — left unchanged.');
    }
  }

  if (patch.role != null && typeof patch.role === 'string' && patch.role.trim()) {
    next.role = resolveRole(patch.role, prefs.defaultRole);
  }

  if (patch.notes != null && typeof patch.notes === 'string') {
    const n = patch.notes.trim();
    if (n) {
      const check = validateNotes(n);
      if (check.ok) next.notes = n;
      else warnings.push(`Notes were not applied: ${check.reason}`);
    }
  }

  if (patch.consultantFirstName != null && typeof patch.consultantFirstName === 'string') {
    next.cFirst = patch.consultantFirstName.trim();
  }
  if (patch.consultantLastName != null && typeof patch.consultantLastName === 'string') {
    next.cLast = patch.consultantLastName.trim();
  }
  if (patch.consultantGmc != null && typeof patch.consultantGmc === 'string') {
    next.cGmc = patch.consultantGmc.trim();
  }

  return { next, warnings };
}

const AI_PATCH_FIELD_ORDER: (keyof AiCasePatch)[] = [
  'case_date',
  'specialty',
  'hospital',
  'operationTags',
  'cepod',
  'role',
  'notes',
  'consultantFirstName',
  'consultantLastName',
  'consultantGmc',
];

/** Short column headers for condensed console autofill lines. */
const AI_PATCH_SHORT: Record<keyof AiCasePatch, string> = {
  case_date: 'date',
  specialty: 'spec',
  hospital: 'trust',
  operationTags: 'tags',
  cepod: 'cepod',
  role: 'role',
  notes: 'notes',
  consultantFirstName: 'cFirst',
  consultantLastName: 'cLast',
  consultantGmc: 'cGmc',
};

function elideForLog(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formSliceValueForPatchKey(slice: CaseFormSliceForAi, key: keyof AiCasePatch): string {
  switch (key) {
    case 'case_date':
      return slice.case_date;
    case 'specialty':
      return slice.specialty;
    case 'hospital':
      return slice.hospital;
    case 'operationTags':
      return slice.operationTags.length ? slice.operationTags.join(', ') : '—';
    case 'cepod':
      return slice.cepod;
    case 'role':
      return slice.role;
    case 'notes':
      return slice.notes.trim() ? slice.notes : '—';
    case 'consultantFirstName':
      return slice.cFirst.trim() || '—';
    case 'consultantLastName':
      return slice.cLast.trim() || '—';
    case 'consultantGmc':
      return slice.cGmc.trim() || '—';
    default:
      return '—';
  }
}

function patchKeyWasSent(patch: AiCasePatch, key: keyof AiCasePatch): boolean {
  if (!Object.prototype.hasOwnProperty.call(patch, key)) return false;
  const v = patch[key];
  return v !== undefined;
}

/**
 * Single console line: merged form values for each patch field, separated by ` | `.
 */
export function logAiAutofillConsoleSummary(args: {
  patch: AiCasePatch;
  prev: CaseFormSliceForAi;
  next: CaseFormSliceForAi;
  warnings: string[];
}): void {
  const { patch, next, warnings } = args;
  const maxVal = 36;
  const sep = ' | ';
  const parts: string[] = [];
  for (const key of AI_PATCH_FIELD_ORDER) {
    if (!patchKeyWasSent(patch, key)) continue;
    const tag = AI_PATCH_SHORT[key];
    const out = elideForLog(formSliceValueForPatchKey(next, key), maxVal);
    parts.push(`${tag}: ${out}`);
  }
  if (warnings.length) {
    for (const w of warnings) {
      parts.push(elideForLog(w, 120));
    }
  }
  const body = parts.length ? parts.join(sep) : '(no patch keys)';
  console.log(`[AI autofill] ${body}`);
}
