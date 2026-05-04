/** Honourific for reports / PDF (default Dr; change in Settings). */
export const NAME_TITLES = ['Dr', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Prof'] as const;

export type NameTitle = (typeof NAME_TITLES)[number];

export const DEFAULT_NAME_TITLE: NameTitle = 'Dr';

/** Max length for case notes (Postgres text is unbounded; we cap in the app for sanity). */
export const NOTES_MAX_LENGTH = 32_000;

export const CASE_PAGE_SIZE = 40;

export const CASE_WARNING_THRESHOLD = 10_000;

/** cepod categories (stored as plain text on cases.cepod). */
export const CE_POD_CHOICES = [
  {
    value: 'Immediate',
    summary: 'Life or limb saving, right now.',
    example: 'Ruptured AAA',
  },
  {
    value: 'Urgent',
    summary: 'Within hours.',
    example: 'Bowel obstruction, fracture fixation',
  },
  {
    value: 'Expedited',
    summary: 'Within days.',
    example: 'Cancer resection',
  },
  {
    value: 'Elective',
    summary: 'Planned.',
    example: 'Hernia repair',
  },
] as const;

export type CepodValue = (typeof CE_POD_CHOICES)[number]['value'];

export const CE_POD_OPTIONS: readonly CepodValue[] = CE_POD_CHOICES.map((c) => c.value);

/** Map older stored labels to the current set. */
export const CE_POD_LEGACY: Readonly<Record<string, CepodValue | ''>> = {
  Emergency: 'Immediate',
  Trauma: 'Urgent',
  'Not recorded': '',
  Elective: 'Elective',
  Expedited: 'Expedited',
  Urgent: 'Urgent',
  Immediate: 'Immediate',
};

export function canonicalCepod(raw: string | null | undefined): CepodValue | '' {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const mapped = CE_POD_LEGACY[t];
  if (mapped === '') return '';
  const u = (mapped ?? t) as string;
  return (CE_POD_OPTIONS as readonly string[]).includes(u) ? (u as CepodValue) : '';
}

/** Prefer saved value; otherwise preference default; otherwise unset. */
export function resolveCepod(raw: string | null | undefined, pref: string | null | undefined): CepodValue | '' {
  const a = canonicalCepod(raw);
  if (a !== '') return a;
  return canonicalCepod(pref);
}

/** UK training / post titles for signup and profile (no free-text grade). */
export const TRAINING_GRADES = [
  'Medical student',
  'FY1',
  'FY2',
  'CT1',
  'CT2',
  'ACCS CT1',
  'ACCS CT2',
  'ST1',
  'ST2',
  'ST3',
  'ST4',
  'ST5',
  'ST6',
  'ST7',
  'ST8',
  'GPST1',
  'GPST2',
  'GPST3',
  'Clinical fellow',
  'SAS doctor',
  'Trust grade / LED',
  'Consultant',
] as const;

export const ROLES = [
  'Observed',
  'Assisted',
  'Performed part',
  'Performed under supervision',
  'Performed independently',
  'Trainer',
] as const;

export type RoleValue = (typeof ROLES)[number];

/** Map older role labels to the current set. */
export const ROLE_LEGACY: Readonly<Record<string, RoleValue>> = {
  Assistant: 'Assisted',
  'Scrubbed assistant': 'Assisted',
};

export function canonicalRole(raw: string | null | undefined): RoleValue | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const u = ROLE_LEGACY[t] ?? t;
  return (ROLES as readonly string[]).includes(u) ? (u as RoleValue) : null;
}

export function resolveRole(raw: string | null | undefined, pref: string | null | undefined): RoleValue {
  return canonicalRole(raw) ?? canonicalRole(pref) ?? ROLES[0];
}

/** Surgical specialties offered in dropdowns (DB stores plain text; not constrained server-side). Alphabetical. */
export const SURGICAL_SPECIALTIES = [
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

export type SurgicalSpecialty = (typeof SURGICAL_SPECIALTIES)[number];

export const DEFAULT_SURGICAL_SPECIALTY: SurgicalSpecialty = 'General surgery';

export function canonicalSpecialty(raw: string | null | undefined): SurgicalSpecialty | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return (SURGICAL_SPECIALTIES as readonly string[]).includes(t) ? (t as SurgicalSpecialty) : null;
}

export function resolveSpecialty(
  raw: string | null | undefined,
  pref: string | null | undefined,
): SurgicalSpecialty {
  return canonicalSpecialty(raw) ?? canonicalSpecialty(pref) ?? DEFAULT_SURGICAL_SPECIALTY;
}

/** Training report PDF layout (Reports screen → `buildTrainingReportPdf`). */
export const REPORT_PDF_FORMATS = [
  {
    value: 'compact' as const,
    label: 'Compact',
    description:
      'Portrait A4. Case table uses four columns only: date, operation, consultant, and role. No specialty, trust, CEPOD, or notes columns. Same trainee header and supervisor sign off as the other formats.',
  },
  {
    value: 'normal' as const,
    label: 'Normal',
    description:
      'Landscape A4. Table with seven columns: date, specialty, trust, operation, CEPOD, consultant, and role; no notes column. Brief role tallies print under the Role column but omit Assisted and Observed. Supervisor sign off on the last page.',
  },
  {
    value: 'detailed' as const,
    label: 'Detailed',
    description:
      'Landscape A4 like normal plus a notes column. Drops the small role tally under the table and instead adds a report statistics section before the supervisor sign off, with full counts for every role, specialty, trust, CEPOD category, and consultant.',
  },
] as const;

export type ReportPdfFormat = (typeof REPORT_PDF_FORMATS)[number]['value'];

/** jsPDF built-in font names for training reports. */
export const REPORT_PDF_FONT_PRESETS = [
  { value: 'helvetica' as const, label: 'Helvetica', helper: 'Sans-serif — default on-screen look.' },
  { value: 'times' as const, label: 'Times Roman', helper: 'Serif — traditional printed reports.' },
  { value: 'courier' as const, label: 'Courier', helper: 'Monospace — aligned columns.' },
] as const;

export type ReportPdfFontFamily = (typeof REPORT_PDF_FONT_PRESETS)[number]['value'];

export const REPORT_PDF_SIZE_PRESETS = [
  { value: 'small' as const, label: 'Small', scale: 0.88 },
  { value: 'medium' as const, label: 'Medium', scale: 1 },
  { value: 'large' as const, label: 'Large', scale: 1.12 },
] as const;

export type ReportPdfSizePreset = (typeof REPORT_PDF_SIZE_PRESETS)[number]['value'];

/** Suggested operation tags (cases.operation is a JSON array of strings; custom tags allowed). */
export const OPERATION_TAG_SUGGESTIONS: readonly string[] = [
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
