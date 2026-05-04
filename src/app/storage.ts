const DRAFT_KEY = 'elogbook_case_draft_v2';

export type CaseDraft = Record<string, unknown>;

export function loadCaseDraft(): CaseDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CaseDraft;
  } catch {
    return null;
  }
}

export function saveCaseDraft(draft: CaseDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearCaseDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const CASE_LIST_VIEW_KEY = 'elogbook_case_list_view_v1';

export type CaseListColumnKey = 'specialty' | 'trust' | 'cepod' | 'role';

export type CaseListViewPrefs = {
  columns: Record<CaseListColumnKey, boolean>;
  sortNewestFirst: boolean;
  filterSpecialty: string;
  filterTrust: string;
  filterCepod: string;
  filterRole: string;
};

export const DEFAULT_CASE_LIST_VIEW_PREFS: CaseListViewPrefs = {
  columns: { specialty: false, trust: false, cepod: false, role: false },
  sortNewestFirst: true,
  filterSpecialty: '',
  filterTrust: '',
  filterCepod: '',
  filterRole: '',
};

function mergeCaseListViewPrefs(raw: unknown): CaseListViewPrefs {
  const base = DEFAULT_CASE_LIST_VIEW_PREFS;
  if (!raw || typeof raw !== 'object') return { ...base };
  const o = raw as Record<string, unknown>;
  const cols = o.columns && typeof o.columns === 'object' ? (o.columns as Record<string, unknown>) : {};
  return {
    columns: {
      specialty: typeof cols.specialty === 'boolean' ? cols.specialty : base.columns.specialty,
      trust: typeof cols.trust === 'boolean' ? cols.trust : base.columns.trust,
      cepod: typeof cols.cepod === 'boolean' ? cols.cepod : base.columns.cepod,
      role: typeof cols.role === 'boolean' ? cols.role : base.columns.role,
    },
    sortNewestFirst: typeof o.sortNewestFirst === 'boolean' ? o.sortNewestFirst : base.sortNewestFirst,
    filterSpecialty: typeof o.filterSpecialty === 'string' ? o.filterSpecialty : base.filterSpecialty,
    filterTrust: typeof o.filterTrust === 'string' ? o.filterTrust : base.filterTrust,
    filterCepod: typeof o.filterCepod === 'string' ? o.filterCepod : base.filterCepod,
    filterRole: typeof o.filterRole === 'string' ? o.filterRole : base.filterRole,
  };
}

export function loadCaseListViewPrefs(): CaseListViewPrefs {
  try {
    const raw = localStorage.getItem(CASE_LIST_VIEW_KEY);
    if (!raw) return { ...DEFAULT_CASE_LIST_VIEW_PREFS };
    return mergeCaseListViewPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CASE_LIST_VIEW_PREFS };
  }
}

export function saveCaseListViewPrefs(prefs: CaseListViewPrefs): void {
  try {
    localStorage.setItem(CASE_LIST_VIEW_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
