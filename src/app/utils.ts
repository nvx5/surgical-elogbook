import {
  canonicalSpecialty,
  DEFAULT_NAME_TITLE,
  DEFAULT_SURGICAL_SPECIALTY,
  NAME_TITLES,
  NOTES_MAX_LENGTH,
} from './constants';
import type { ConsultantEntry, Preferences } from './types';
import { defaultPreferences } from './types';

const BANNED_SUBSTRINGS = [
  'nhs number',
  'hospital number',
  'date of birth',
  'dob:',
  'dob ',
  'mrn',
  'medical record number',
  'postcode',
  'zip code',
  'national insurance',
];

const BANNED_WORD_RE = /\b(nhs|mrn)\b/i;

const NHS_LIKE_RE = /\b\d{3}\s?\d{3}\s?\d{4}\b/;
const LONG_DIGITS_RE = /\d{10,}/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const PHONE_LIKE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?0\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/;

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

export type NotesValidation = { ok: true } | { ok: false; reason: string };

export function validateNotes(notes: string): NotesValidation {
  const t = notes ?? '';
  if (t.length > NOTES_MAX_LENGTH) {
    return { ok: false, reason: `Notes must be at most ${NOTES_MAX_LENGTH} characters.` };
  }
  const lower = t.toLowerCase();
  for (const phrase of BANNED_SUBSTRINGS) {
    if (lower.includes(phrase)) {
      return {
        ok: false,
        reason: `Notes must not include sensitive phrases such as "${phrase}".`,
      };
    }
  }
  if (BANNED_WORD_RE.test(t)) {
    return { ok: false, reason: 'Notes must not include NHS/MRN style identifiers.' };
  }
  const compact = t.replace(/[\s-]/g, '');
  if (NHS_LIKE_RE.test(t) || LONG_DIGITS_RE.test(compact)) {
    return {
      ok: false,
      reason: 'Notes must not include long number sequences or NHS-style numbers.',
    };
  }
  if (EMAIL_RE.test(t)) {
    return { ok: false, reason: 'Notes must not include email addresses.' };
  }
  const phoneMatch = t.match(PHONE_LIKE_RE);
  if (phoneMatch && digitCount(phoneMatch[0]) >= 10) {
    return { ok: false, reason: 'Notes must not include phone-like number sequences.' };
  }
  return { ok: true };
}

export function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const NAME_TITLE_SET = new Set<string>(NAME_TITLES);

function parseTitle(raw: unknown): string {
  if (typeof raw !== 'string' || !NAME_TITLE_SET.has(raw)) return DEFAULT_NAME_TITLE;
  return raw;
}

/** Read signup / profile metadata from Supabase `user.user_metadata`. */
export function profileFromAuthMetadata(meta: unknown): { fullName: string; grade: string | null } {
  if (!meta || typeof meta !== 'object') return { fullName: '', grade: null };
  const m = meta as Record<string, unknown>;
  const fn =
    (typeof m.full_name === 'string' && m.full_name.trim()) ||
    (typeof m.name === 'string' && m.name.trim()) ||
    '';
  const gr = typeof m.grade === 'string' ? m.grade.trim() : '';
  return { fullName: fn, grade: gr || null };
}

/** Preferences for a brand-new `public.users` row (merges auth metadata). */
export function initialPreferencesFromAuth(meta: unknown): Preferences {
  const { fullName } = profileFromAuthMetadata(meta);
  return {
    ...defaultPreferences(),
    fullName,
    title: DEFAULT_NAME_TITLE,
  };
}

export function formatTraineeLine(prefs: Preferences): string {
  if (!prefs.fullName?.trim()) return '—';
  const t = prefs.title?.trim() || DEFAULT_NAME_TITLE;
  return `${t} ${prefs.fullName.trim()}`;
}

export function parsePreferences(raw: unknown): Preferences {
  const base: Preferences = {
    title: DEFAULT_NAME_TITLE,
    fullName: '',
    gmcNumber: '',
    favouriteTags: [],
    defaultCepod: '',
    defaultRole: '',
    defaultHospital: '',
    defaultSpecialty: DEFAULT_SURGICAL_SPECIALTY,
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const legacyFav = Array.isArray(o.favouriteProcedures)
    ? o.favouriteProcedures.filter((x): x is string => typeof x === 'string')
    : [];
  const favTags = Array.isArray(o.favouriteTags)
    ? o.favouriteTags.filter((x): x is string => typeof x === 'string')
    : legacyFav;
  return {
    title: parseTitle(o.title),
    fullName: typeof o.fullName === 'string' ? o.fullName : '',
    gmcNumber: typeof o.gmcNumber === 'string' ? o.gmcNumber : '',
    favouriteTags: favTags,
    defaultCepod: typeof o.defaultCepod === 'string' ? o.defaultCepod : '',
    defaultRole: typeof o.defaultRole === 'string' ? o.defaultRole : '',
    defaultHospital: typeof o.defaultHospital === 'string' ? o.defaultHospital : '',
    defaultSpecialty:
      canonicalSpecialty(typeof o.defaultSpecialty === 'string' ? o.defaultSpecialty : '') ??
      DEFAULT_SURGICAL_SPECIALTY,
  };
}

export function consultantKey(c: import('./types').ConsultantEntry): string {
  return `${c.firstname}|${c.lastname}|${c.gmc}`.toLowerCase();
}

export function parseOperationTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
}

/** Display e.g. LAPAROTOMY + ADHESIOLYSIS + HARTMANN'S */
export function formatOperationTags(raw: unknown): string {
  const tags = parseOperationTags(raw);
  if (!tags.length) return '—';
  return tags.map((t) => t.toUpperCase()).join(' + ');
}

export function parseConsultant(raw: unknown): ConsultantEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const firstname = typeof o.firstname === 'string' ? o.firstname.trim() : '';
  const lastname = typeof o.lastname === 'string' ? o.lastname.trim() : '';
  const gmc = typeof o.gmc === 'string' ? o.gmc.trim() : '';
  if (!firstname && !lastname && !gmc) return null;
  return { firstname, lastname, gmc };
}

export function formatConsultant(c: ConsultantEntry | null): string {
  if (!c) return '—';
  const name = [c.firstname, c.lastname].filter(Boolean).join(' ').trim();
  if (!name && !c.gmc) return '—';
  if (c.gmc) return name ? `${name} (GMC ${c.gmc})` : `GMC ${c.gmc}`;
  return name || '—';
}

/** e.g. Colin MacKenzie → CM */
export function formatConsultantInitials(c: ConsultantEntry | null): string {
  if (!c) return '—';
  const fi = c.firstname.trim().charAt(0).toUpperCase();
  const li = c.lastname.trim().charAt(0).toUpperCase();
  if (fi && li) return `${fi}${li}`;
  if (fi) return fi;
  if (li) return li;
  return '—';
}

/** Saved-consultant picker line: `Jane Doe (JD) (8000000)` — digits only in the last parens when GMC is set. */
export function formatSavedConsultantPickLabel(c: ConsultantEntry): string {
  const name = [c.firstname, c.lastname].map((s) => s.trim()).filter(Boolean).join(' ').trim();
  const initials = formatConsultantInitials(c);
  const gmc = c.gmc.trim();
  let out = name;
  if (initials !== '—') out += ` (${initials})`;
  if (gmc) out += ` (${gmc})`;
  const t = out.trim();
  if (t) return t;
  if (gmc) return `(${gmc})`;
  return '—';
}

/** `case_date` is ISO YYYY-MM-DD → UK-style numeric DD MM YYYY (padded, space-separated) */
export function formatCaseDateUK(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]} ${m[2]} ${m[1]}`;
}

export function parseConsultantsList(raw: unknown): ConsultantEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ConsultantEntry[] = [];
  for (const el of raw) {
    const c = parseConsultant(el);
    if (c) out.push(c);
  }
  return out;
}
