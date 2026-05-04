import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CE_POD_CHOICES,
  CE_POD_OPTIONS,
  canonicalCepod,
  canonicalRole,
  canonicalSpecialty,
  DEFAULT_SURGICAL_SPECIALTY,
  NOTES_MAX_LENGTH,
  OPERATION_TAG_SUGGESTIONS,
  resolveCepod,
  resolveRole,
  resolveSpecialty,
  ROLES,
  SURGICAL_SPECIALTIES,
} from '../constants';
import { clearCaseDraft, loadCaseDraft, saveCaseDraft } from '../storage';
import type { CaseRow, ConsultantEntry, Preferences } from '../types';
import {
  consultantKey,
  formatDateISO,
  parseConsultant,
  parseConsultantsList,
  parseOperationTags,
  validateNotes,
} from '../utils';
import { isOfficialUkNhsTrustName, UK_NHS_TRUSTS } from '../ukNhsTrusts';
import { Combobox } from './Combobox';
import { ConsultantSavedPicker } from './ConsultantSavedPicker';
import { DefaultPrefStar } from './DefaultPrefStar';

type Props = {
  supabase: SupabaseClient;
  userId: string;
  prefs: Preferences;
  savedConsultants: ConsultantEntry[];
  editing: CaseRow | null;
  lastCase: CaseRow | null;
  onSaved: () => void;
  onCancel: () => void;
  onUserDataUpdated?: () => void;
};

type FormState = {
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

function requiredCepodValue(raw: string | null | undefined, pref: string | null | undefined): string {
  const r = resolveCepod(raw, pref);
  return r !== '' ? r : CE_POD_OPTIONS[0];
}

function emptyForm(p: Preferences, today: string): FormState {
  const role = resolveRole('', p.defaultRole);
  const defH = p.defaultHospital?.trim() ?? '';
  return {
    case_date: today,
    specialty: resolveSpecialty('', p.defaultSpecialty),
    hospital: defH && isOfficialUkNhsTrustName(defH) ? defH : '',
    operationTags: [],
    tagInput: '',
    cepod: requiredCepodValue('', p.defaultCepod),
    role,
    notes: '',
    cFirst: '',
    cLast: '',
    cGmc: '',
  };
}

function rowToForm(c: CaseRow, prefs: Preferences): FormState {
  const cons = parseConsultant(c.consultant);
  const h = (c.hospital ?? '').trim();
  return {
    case_date: c.case_date,
    specialty: resolveSpecialty(c.specialty ?? '', prefs.defaultSpecialty),
    hospital: h && isOfficialUkNhsTrustName(h) ? h : '',
    operationTags: parseOperationTags(c.operation),
    tagInput: '',
    cepod: requiredCepodValue(c.cepod, prefs.defaultCepod),
    role: resolveRole(c.role, prefs.defaultRole),
    notes: c.notes ?? '',
    cFirst: cons?.firstname ?? '',
    cLast: cons?.lastname ?? '',
    cGmc: cons?.gmc ?? '',
  };
}

function toNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

function formatSaveError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const o = e as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (parts.length) return parts.join(' — ');
  }
  return e instanceof Error ? e.message : 'Could not save';
}

function consultantPayload(f: FormState): ConsultantEntry | null {
  const firstname = f.cFirst.trim();
  const lastname = f.cLast.trim();
  const gmc = f.cGmc.trim();
  if (!firstname && !lastname && !gmc) return null;
  return { firstname, lastname, gmc };
}

export function CaseForm({
  supabase,
  userId,
  prefs,
  savedConsultants,
  editing,
  lastCase,
  onSaved,
  onCancel,
  onUserDataUpdated,
}: Props) {
  const today = formatDateISO(new Date());
  const [form, setForm] = useState<FormState>(() =>
    editing ? rowToForm(editing, prefs) : { ...emptyForm(prefs, today), ...loadDraftSafe(prefs) },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorBannerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return () => window.clearTimeout(t);
  }, [error]);

  const tagSuggestions = useMemo(() => {
    const q = form.tagInput.trim().toLowerCase();
    const pool = [...new Set([...OPERATION_TAG_SUGGESTIONS, ...prefs.favouriteTags])].sort((a, b) =>
      a.localeCompare(b),
    );
    const picked = new Set(form.operationTags.map((t) => t.toLowerCase()));
    const list = !q
      ? pool.filter((t) => !picked.has(t.toLowerCase())).slice(0, 14)
      : pool
          .filter((t) => !picked.has(t.toLowerCase()) && t.toLowerCase().includes(q))
          .slice(0, 14);
    return list;
  }, [form.tagInput, form.operationTags, prefs.favouriteTags]);

  useEffect(() => {
    if (editing) {
      setForm(rowToForm(editing, prefs));
      return;
    }
    const draft = loadDraftSafe(prefs);
    if (Object.keys(draft).length) {
      setForm((prev) => ({
        ...emptyForm(prefs, today),
        ...prev,
        ...draft,
        case_date: typeof draft.case_date === 'string' ? draft.case_date : today,
      }));
    } else {
      setForm(emptyForm(prefs, today));
    }
  }, [editing, prefs, today]);

  const scheduleDraftSave = useCallback((next: FormState) => {
    if (editing) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveCaseDraft({ ...next } as Record<string, unknown>);
    }, 400);
  }, [editing]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      scheduleDraftSave(next);
      return next;
    });
  }

  function loadDraftSafe(p: Preferences): Partial<FormState> {
    const d = loadCaseDraft();
    if (!d || typeof d !== 'object') return {};
    const o = d as Record<string, unknown>;
    const out: Partial<FormState> = {};
    if (typeof o.case_date === 'string') out.case_date = o.case_date;
    if (typeof o.specialty === 'string') {
      out.specialty = resolveSpecialty(o.specialty, p.defaultSpecialty);
    }
    if (typeof o.hospital === 'string') {
      const hs = o.hospital.trim();
      if (hs && isOfficialUkNhsTrustName(hs)) out.hospital = hs;
    }
    if (Array.isArray(o.operationTags)) {
      out.operationTags = o.operationTags.filter((x): x is string => typeof x === 'string');
    }
    if (typeof o.cepod === 'string') {
      out.cepod = requiredCepodValue(o.cepod, p.defaultCepod);
    }
    if (typeof o.role === 'string') {
      out.role = resolveRole(o.role, p.defaultRole);
    }
    if (typeof o.notes === 'string') out.notes = o.notes;
    if (typeof o.cFirst === 'string') out.cFirst = o.cFirst;
    if (typeof o.cLast === 'string') out.cLast = o.cLast;
    if (typeof o.cGmc === 'string') out.cGmc = o.cGmc;
    return out;
  }

  async function persistPrefs(patch: Partial<Preferences>) {
    setError(null);
    setPrefsSaving(true);
    try {
      const merged: Preferences = { ...prefs, ...patch };
      const dh = merged.defaultHospital.trim();
      if (dh && !isOfficialUkNhsTrustName(dh)) {
        setError('Default trust must be chosen from the official list.');
        return;
      }
      if (!canonicalSpecialty(merged.defaultSpecialty)) {
        setError('Choose a valid default specialty.');
        return;
      }
      const { error: err } = await supabase
        .from('users')
        .update({ preferences: merged as unknown as Record<string, unknown> })
        .eq('id', userId);
      if (err) throw err;
      onUserDataUpdated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update defaults');
    } finally {
      setPrefsSaving(false);
    }
  }

  const hospitalDefaultActive =
    !!form.hospital.trim() && form.hospital.trim() === prefs.defaultHospital.trim();
  const specialtyDefaultActive = canonicalSpecialty(form.specialty) === prefs.defaultSpecialty;
  const cepodDefaultActive =
    prefs.defaultCepod.trim() !== '' &&
    canonicalCepod(form.cepod) !== '' &&
    canonicalCepod(form.cepod) === canonicalCepod(prefs.defaultCepod);
  const roleDefaultActive =
    prefs.defaultRole.trim() !== '' &&
    canonicalRole(form.role) !== null &&
    canonicalRole(form.role) === canonicalRole(prefs.defaultRole);

  function toggleHospitalDefault() {
    const h = form.hospital.trim();
    if (!h) return;
    void persistPrefs(hospitalDefaultActive ? { defaultHospital: '' } : { defaultHospital: h });
  }

  function toggleSpecialtyDefault() {
    const c = canonicalSpecialty(form.specialty);
    if (!c) return;
    void persistPrefs(
      specialtyDefaultActive ? { defaultSpecialty: DEFAULT_SURGICAL_SPECIALTY } : { defaultSpecialty: c },
    );
  }

  function toggleCepodDefault() {
    const ce = canonicalCepod(form.cepod);
    if (ce === '') return;
    void persistPrefs(cepodDefaultActive ? { defaultCepod: '' } : { defaultCepod: ce });
  }

  function toggleRoleDefault() {
    const r = canonicalRole(form.role);
    void persistPrefs(roleDefaultActive ? { defaultRole: '' } : { defaultRole: r ?? ROLES[0] });
  }

  async function persistUserAutocompleteData() {
    const cons = consultantPayload(form);
    const { data: u, error: e1 } = await supabase.from('users').select('consultants').eq('id', userId).single();
    if (e1 || !u) return;
    const row = u as Record<string, unknown>;
    const consultants = parseConsultantsList(row.consultants);
    let nextConsultants = consultants;
    let consDirty = false;
    if (cons) {
      const k = consultantKey(cons);
      if (!consultants.some((c) => consultantKey(c) === k)) {
        nextConsultants = [...consultants, cons];
        consDirty = true;
      }
    }
    if (consDirty) {
      await supabase.from('users').update({ consultants: nextConsultants }).eq('id', userId);
      onUserDataUpdated?.();
    }
  }

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setForm((prev) => {
      const lower = t.toLowerCase();
      if (prev.operationTags.some((x) => x.toLowerCase() === lower)) {
        const next = { ...prev, tagInput: '' };
        scheduleDraftSave(next);
        return next;
      }
      const next = { ...prev, operationTags: [...prev.operationTags, t], tagInput: '' };
      scheduleDraftSave(next);
      return next;
    });
  }

  function removeTag(i: number) {
    setForm((prev) => {
      const next = { ...prev, operationTags: prev.operationTags.filter((_, j) => j !== i) };
      scheduleDraftSave(next);
      return next;
    });
  }

  async function submit(mode: 'normal' | 'another') {
    setError(null);
    const hosp = form.hospital.trim();
    if (hosp && !isOfficialUkNhsTrustName(hosp)) {
      setError('If you choose a trust, pick one from the list. Custom names are not allowed.');
      return;
    }
    if (!form.operationTags.length) {
      setError('Add at least one procedure tag.');
      return;
    }
    const notesCheck = validateNotes(form.notes);
    if (!notesCheck.ok) {
      setError(notesCheck.reason);
      return;
    }
    const rawCepod = canonicalCepod(form.cepod);
    if (rawCepod === '') {
      setError('Choose a CEPOD category.');
      return;
    }
    const cepodVal = rawCepod;
    const specialtyVal = canonicalSpecialty(form.specialty);
    if (!specialtyVal) {
      setError('Choose a surgical specialty.');
      return;
    }
    setSaving(true);
    const cons = consultantPayload(form);
    const roleVal = canonicalRole(form.role) ?? ROLES[0];
    const notesVal = toNull(form.notes);
    /** Full row for updates (must send nulls to clear optional fields). */
    const updatePayload = {
      case_date: form.case_date,
      specialty: specialtyVal,
      hospital: hosp,
      operation: form.operationTags,
      cepod: cepodVal,
      consultant: cons,
      role: roleVal,
      notes: notesVal,
    };
    /**
     * New rows: omit empty optional keys so older DBs without `hospital` / nullable extras
     * still accept the insert (PostgREST 400 if the JSON includes unknown columns).
     */
    const insertRow: Record<string, unknown> = {
      user_id: userId,
      case_date: form.case_date,
      specialty: specialtyVal,
      operation: form.operationTags,
      role: roleVal,
      notes: notesVal,
    };
    if (hosp) insertRow.hospital = hosp;
    insertRow.cepod = cepodVal;
    if (cons) insertRow.consultant = cons;
    try {
      if (editing) {
        const { error: err } = await supabase.from('cases').update(updatePayload).eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('cases').insert(insertRow);
        if (err) throw err;
      }
      await persistUserAutocompleteData();
      clearCaseDraft();
      if (mode === 'another' && !editing) {
        setForm(emptyForm(prefs, today));
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: unknown) {
      setError(formatSaveError(e));
    } finally {
      setSaving(false);
    }
  }

  function duplicateLast() {
    if (!lastCase) {
      setError('No previous case to copy from.');
      return;
    }
    setForm(rowToForm(lastCase, prefs));
    setError(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">Case log</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{editing ? 'Edit case' : 'Add case'}</h1>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7M8 12h13" />
          </svg>
          Back
        </button>
      </div>
      <p className="mt-2 w-full text-sm leading-relaxed text-slate-600">
        {editing
          ? 'Change any fields you need, then save. What you save replaces the earlier version of this entry.'
          : 'Log one procedure. Fields can copy from your most recent case or from saved preferences. Do not type patient identifiers into notes.'}
      </p>
      {error ? (
        <p
          ref={errorBannerRef}
          className="mt-4 scroll-mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-6 space-y-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card sm:p-6">
        <div>
          <label className="text-sm font-semibold text-slate-700" htmlFor="case_date">
            Date
          </label>
          <input
            id="case_date"
            type="date"
            required
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={form.case_date}
            onChange={(e) => setField('case_date', e.target.value)}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="specialty">
              Specialty
            </label>
            <DefaultPrefStar
              active={specialtyDefaultActive}
              busy={prefsSaving}
              disabled={prefsSaving}
              onToggle={toggleSpecialtyDefault}
              size="sm"
            />
          </div>
          <select
            id="specialty"
            name="specialty"
            required
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={form.specialty}
            onChange={(e) => setField('specialty', e.target.value)}
          >
            {SURGICAL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <Combobox
          id="hospital"
          label="Trust"
          value={form.hospital}
          onChange={(v) => setField('hospital', v)}
          options={UK_NHS_TRUSTS}
          placeholder="Search NHS trusts and health boards…"
          allowCustom={false}
          clearable
          defaultFavorite={{
            active: hospitalDefaultActive,
            onToggle: toggleHospitalDefault,
            busy: prefsSaving,
            disabled: prefsSaving,
          }}
        />

        <div>
          <span className="text-sm font-semibold text-slate-700">Procedure</span>
          <p className="mt-1 text-xs text-slate-500">
            Shown as{' '}
            <span className="font-mono text-slate-700">
              {form.operationTags.length
                ? form.operationTags.map((t) => t.toUpperCase()).join(' + ')
                : '—'}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.operationTags.map((t, i) => (
              <button
                key={`${t}-${i}`}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-clinical-100 px-3 py-1 text-left text-sm font-medium text-clinical-900 transition hover:bg-clinical-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-500/40"
                aria-label={`Remove ${t}`}
                onClick={() => removeTag(i)}
              >
                <span className="min-w-0">{t}</span>
                <span className="shrink-0 text-clinical-700" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex w-full min-h-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-clinical-500 focus-within:ring-2 focus-within:ring-clinical-500/25">
            <input
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base outline-none ring-0 placeholder:text-slate-400"
              placeholder="Type a procedure tag and press Add"
              value={form.tagInput}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setField('tagInput', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(form.tagInput);
                }
              }}
            />
            <button
              type="button"
              className="shrink-0 border-l border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={() => addTag(form.tagInput)}
            >
              Add procedure
            </button>
          </div>
          {tagSuggestions.length > 0 ? (
            <div className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Suggestions</div>
              <div className="flex flex-wrap gap-1.5">
                {tagSuggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-full border border-clinical-200 bg-white px-2.5 py-1 text-xs font-medium text-clinical-900 shadow-sm hover:bg-clinical-50"
                    onClick={() => addTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">CEPOD</span>
            <DefaultPrefStar
              active={cepodDefaultActive}
              busy={prefsSaving}
              disabled={prefsSaving}
              onToggle={toggleCepodDefault}
              size="sm"
            />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CE_POD_CHOICES.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50 has-[:checked]:shadow-sm"
              >
                <input
                  type="radio"
                  name="cepod"
                  className="mt-1 shrink-0"
                  value={opt.value}
                  checked={form.cepod === opt.value}
                  onChange={() => setField('cepod', opt.value)}
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{opt.value}</span>
                  <span className="mt-1 block text-xs font-normal leading-snug text-slate-600">
                    {opt.summary} For example: {opt.example}.
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-semibold text-slate-700">Consultant</span>
          {savedConsultants.length > 0 ? (
            <div className="mt-2">
              <ConsultantSavedPicker
                consultants={savedConsultants}
                onPick={(c) => {
                  setForm((prev) => {
                    const next = {
                      ...prev,
                      cFirst: c.firstname,
                      cLast: c.lastname,
                      cGmc: c.gmc,
                    };
                    scheduleDraftSave(next);
                    return next;
                  });
                }}
              />
            </div>
          ) : null}
          <div className={`grid gap-3 sm:grid-cols-3 ${savedConsultants.length > 0 ? 'mt-3' : 'mt-2'}`}>
            <div>
              <label className="text-xs font-medium text-slate-600" htmlFor="c-first">
                First name
              </label>
              <input
                id="c-first"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                value={form.cFirst}
                autoComplete="off"
                onChange={(e) => setField('cFirst', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600" htmlFor="c-last">
                Last name
              </label>
              <input
                id="c-last"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                value={form.cLast}
                autoComplete="off"
                onChange={(e) => setField('cLast', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600" htmlFor="c-gmc">
                GMC number
              </label>
              <input
                id="c-gmc"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                value={form.cGmc}
                autoComplete="off"
                onChange={(e) => setField('cGmc', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">Role</span>
            <DefaultPrefStar
              active={roleDefaultActive}
              busy={prefsSaving}
              disabled={prefsSaving}
              onToggle={toggleRoleDefault}
              size="sm"
            />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50 has-[:checked]:shadow-sm"
              >
                <input
                  type="radio"
                  name="role"
                  className="mt-1 shrink-0"
                  value={r}
                  checked={form.role === r}
                  onChange={() => setField('role', r)}
                />
                <span className="font-semibold leading-snug text-slate-900">{r}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700" htmlFor="notes">
            Notes
          </label>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Do not enter anything that could identify a patient, including names, NHS numbers, hospital numbers, dates
            of birth, addresses, phone numbers, or other identifiers.
          </p>
          <textarea
            id="notes"
            maxLength={NOTES_MAX_LENGTH}
            rows={6}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
          />
          <div className="mt-1 text-right text-xs text-slate-500">
            {form.notes.length.toLocaleString()}/{NOTES_MAX_LENGTH.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit('normal')}
          className="rounded-xl bg-clinical-600 px-5 py-3 font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save case'}
        </button>
        {!editing ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit('another')}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            Save and add another
          </button>
        ) : null}
        {!editing ? (
          <button
            type="button"
            disabled={saving}
            onClick={duplicateLast}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            Copy details from last case
          </button>
        ) : null}
      </div>
    </div>
  );
}
