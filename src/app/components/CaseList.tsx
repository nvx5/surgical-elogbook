import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CASE_PAGE_SIZE,
  CE_POD_OPTIONS,
  DEFAULT_SURGICAL_SPECIALTY,
  ROLES,
  SURGICAL_SPECIALTIES,
} from '../constants';
import {
  DEFAULT_CASE_LIST_VIEW_PREFS,
  loadCaseListViewPrefs,
  saveCaseListViewPrefs,
  type CaseListColumnKey,
  type CaseListViewPrefs,
} from '../storage';
import type { CaseRow } from '../types';
import {
  formatCaseDateUK,
  formatConsultantInitials,
  formatOperationTags,
  parseConsultant,
} from '../utils';

type Props = {
  supabase: SupabaseClient;
  onEdit: (c: CaseRow) => void;
  onAddCase: () => void;
  profileError: string | null;
  onCaseCountStale?: () => void;
};

function filtersActive(p: CaseListViewPrefs): boolean {
  return !!(p.filterSpecialty.trim() || p.filterTrust.trim() || p.filterCepod.trim() || p.filterRole.trim());
}

function viewCustomized(p: CaseListViewPrefs): boolean {
  return (
    p.columns.specialty ||
    p.columns.trust ||
    p.columns.cepod ||
    p.columns.role ||
    !p.sortNewestFirst ||
    filtersActive(p)
  );
}

function tableColSpan(cols: CaseListViewPrefs['columns']): number {
  return (
    4 +
    (cols.specialty ? 1 : 0) +
    (cols.trust ? 1 : 0) +
    (cols.cepod ? 1 : 0) +
    (cols.role ? 1 : 0)
  );
}

const COLUMN_LABELS: Record<CaseListColumnKey, string> = {
  specialty: 'Specialty',
  trust: 'Trust (hospital)',
  cepod: 'CEPOD',
  role: 'Role',
};

export function CaseList({ supabase, onEdit, onAddCase, profileError, onCaseCountStale }: Props) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CaseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [listPrefs, setListPrefs] = useState<CaseListViewPrefs>(() => loadCaseListViewPrefs());
  const [controlsOpen, setControlsOpen] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<CaseListViewPrefs>(() => loadCaseListViewPrefs());

  const colSpan = useMemo(() => tableColSpan(listPrefs.columns), [listPrefs.columns]);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = page * CASE_PAGE_SIZE;
      const to = from + CASE_PAGE_SIZE - 1;
      let q = supabase
        .from('cases')
        .select('*', { count: 'exact' })
        .order('case_date', { ascending: !listPrefs.sortNewestFirst });

      const fs = listPrefs.filterSpecialty.trim();
      if (fs) q = q.eq('specialty', fs);

      const ft = listPrefs.filterTrust.trim();
      if (ft) q = q.ilike('hospital', `%${ft}%`);

      const fc = listPrefs.filterCepod.trim();
      if (fc) q = q.eq('cepod', fc);

      const fr = listPrefs.filterRole.trim();
      if (fr) q = q.eq('role', fr);

      const { data, error: err, count } = await q.range(from, to);
      if (err) throw err;
      setCases((data ?? []) as CaseRow[]);
      setTotal(count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cases');
      setCases([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [supabase, page, listPrefs]);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  const closeDeleteModal = useCallback(() => {
    if (!deleteBusy) setPendingDelete(null);
  }, [deleteBusy]);

  useEffect(() => {
    if (!pendingDelete) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !deleteBusy) closeDeleteModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete, deleteBusy, closeDeleteModal]);

  const closeControls = useCallback(() => setControlsOpen(false), []);

  useEffect(() => {
    if (!controlsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeControls();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlsOpen, closeControls]);

  function openControls() {
    setDraftPrefs(listPrefs);
    setControlsOpen(true);
  }

  function applyControls() {
    setListPrefs(draftPrefs);
    saveCaseListViewPrefs(draftPrefs);
    setPage(0);
    setControlsOpen(false);
  }

  async function confirmDeleteCase() {
    const c = pendingDelete;
    if (!c) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('cases').delete().eq('id', c.id);
      if (err) throw err;
      setPendingDelete(null);
      void fetchCases();
      onCaseCountStale?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete case');
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / CASE_PAGE_SIZE));

  const cols = listPrefs.columns;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">Logbook</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cases</h1>
        </div>
        <button
          type="button"
          onClick={onAddCase}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-clinical-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" d="M12 4.5v15M4.5 12h15" />
          </svg>
          Add case
        </button>
      </div>
      <p className="mt-2 w-full text-sm leading-relaxed text-slate-600">
        Browse and manage your operative log. Add a row after theatre or open an existing entry to change it. Do not
        store anything that could identify a patient anywhere in this app.
      </p>
      {profileError ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card" role="status">
          {profileError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Showing {cases.length ? page * CASE_PAGE_SIZE + 1 : 0} to {page * CASE_PAGE_SIZE + cases.length} of{' '}
          {total.toLocaleString()}
        </p>
        <button
          type="button"
          onClick={openControls}
          className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          aria-haspopup="dialog"
          aria-expanded={controlsOpen}
        >
          {viewCustomized(listPrefs) ? (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-clinical-500 ring-2 ring-white" aria-hidden />
          ) : null}
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
          Columns & filters
        </button>
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : cases.length === 0 ? (
          <p className="text-sm text-slate-500">No cases yet.</p>
        ) : (
          cases.map((c) => {
            const roleCepodParts: string[] = [];
            if (cols.role) roleCepodParts.push(c.role);
            if (cols.cepod && c.cepod) roleCepodParts.push(c.cepod);
            const dateTrust =
              formatCaseDateUK(c.case_date) +
              (cols.trust ? ` · ${c.hospital?.trim() ? c.hospital : '—'}` : '');
            return (
              <article key={c.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card">
                <div className="font-semibold text-slate-900">{formatOperationTags(c.operation)}</div>
                {cols.specialty ? (
                  <div className="mt-1 text-xs font-medium text-clinical-800">{c.specialty ?? DEFAULT_SURGICAL_SPECIALTY}</div>
                ) : null}
                <div className="mt-1 text-sm text-slate-600">{dateTrust}</div>
                {roleCepodParts.length > 0 ? (
                  <div className="text-sm text-slate-600">{roleCepodParts.join(' · ')}</div>
                ) : null}
                <div className="text-sm text-slate-600">{formatConsultantInitials(parseConsultant(c.consultant))}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-clinical-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-700"
                    onClick={() => onEdit(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={() => setPendingDelete(c)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-card md:block">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              {cols.specialty ? <th className="px-3 py-2">Specialty</th> : null}
              {cols.trust ? <th className="px-3 py-2">Trust</th> : null}
              <th className="min-w-[30rem] px-3 py-2 sm:min-w-[38rem] lg:min-w-[42rem]">Operation</th>
              {cols.cepod ? <th className="px-3 py-2">CEPOD</th> : null}
              <th className="px-3 py-2">Consultant</th>
              {cols.role ? <th className="px-3 py-2">Role</th> : null}
              <th className="px-3 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-slate-500">
                  No cases yet.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="transition hover:bg-clinical-50/40">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-800">{formatCaseDateUK(c.case_date)}</td>
                  {cols.specialty ? (
                    <td className="max-w-[10rem] truncate px-3 py-2 text-slate-700">{c.specialty ?? DEFAULT_SURGICAL_SPECIALTY}</td>
                  ) : null}
                  {cols.trust ? (
                    <td className="max-w-[8rem] truncate px-3 py-2 text-slate-700">{c.hospital || '—'}</td>
                  ) : null}
                  <td className="min-w-[30rem] px-3 py-2 align-top font-medium leading-snug text-slate-900 break-words sm:min-w-[38rem] lg:min-w-[42rem]">
                    {formatOperationTags(c.operation)}
                  </td>
                  {cols.cepod ? <td className="whitespace-nowrap px-3 py-2 text-slate-700">{c.cepod ?? '—'}</td> : null}
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                    {formatConsultantInitials(parseConsultant(c.consultant))}
                  </td>
                  {cols.role ? <td className="px-3 py-2 text-slate-700">{c.role}</td> : null}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      className="mr-2 font-semibold text-clinical-700 hover:underline"
                      onClick={() => onEdit(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="font-semibold text-red-700 hover:underline"
                      onClick={() => setPendingDelete(c)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={page <= 0}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page + 1 >= totalPages}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {controlsOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeControls();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-controls-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="case-controls-title" className="text-lg font-bold text-slate-900">
              Table & list view
            </h3>
            <p className="mt-1 text-sm text-slate-600">Choose visible columns, sort order, and optional filters. Applies to this device only.</p>

            <div className="mt-5">
              <span className="text-xs font-medium text-slate-600">Visible columns</span>
              <div className="mt-2 space-y-2">
                {(Object.keys(COLUMN_LABELS) as CaseListColumnKey[]).map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-clinical-600 focus:ring-clinical-500"
                      checked={draftPrefs.columns[key]}
                      onChange={(e) =>
                        setDraftPrefs((p) => ({
                          ...p,
                          columns: { ...p.columns, [key]: e.target.checked },
                        }))
                      }
                    />
                    <span className="font-medium text-slate-900">{COLUMN_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Date, operation, and consultant stay visible; actions always stay on the right.</p>
            </div>

            <div className="mt-5">
              <span className="text-xs font-medium text-slate-600">Sort by case date</span>
              <div className="mt-2 space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50">
                  <input
                    type="radio"
                    name="case-sort"
                    className="shrink-0"
                    checked={draftPrefs.sortNewestFirst}
                    onChange={() => setDraftPrefs((p) => ({ ...p, sortNewestFirst: true }))}
                  />
                  <span className="font-medium text-slate-900">Newest first</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50">
                  <input
                    type="radio"
                    name="case-sort"
                    className="shrink-0"
                    checked={!draftPrefs.sortNewestFirst}
                    onChange={() => setDraftPrefs((p) => ({ ...p, sortNewestFirst: false }))}
                  />
                  <span className="font-medium text-slate-900">Oldest first</span>
                </label>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <span className="text-xs font-medium text-slate-600">Filters</span>
              <div>
                <label className="text-xs font-medium text-slate-600" htmlFor="flt-specialty">
                  Specialty
                </label>
                <select
                  id="flt-specialty"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                  value={draftPrefs.filterSpecialty}
                  onChange={(e) => setDraftPrefs((p) => ({ ...p, filterSpecialty: e.target.value }))}
                >
                  <option value="">All specialties</option>
                  {SURGICAL_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600" htmlFor="flt-trust">
                  Trust contains
                </label>
                <input
                  id="flt-trust"
                  type="search"
                  placeholder="Search trust name…"
                  autoComplete="off"
                  value={draftPrefs.filterTrust}
                  onChange={(e) => setDraftPrefs((p) => ({ ...p, filterTrust: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600" htmlFor="flt-cepod">
                  CEPOD
                </label>
                <select
                  id="flt-cepod"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                  value={draftPrefs.filterCepod}
                  onChange={(e) => setDraftPrefs((p) => ({ ...p, filterCepod: e.target.value }))}
                >
                  <option value="">All</option>
                  {CE_POD_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600" htmlFor="flt-role">
                  Role
                </label>
                <select
                  id="flt-role"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
                  value={draftPrefs.filterRole}
                  onChange={(e) => setDraftPrefs((p) => ({ ...p, filterRole: e.target.value }))}
                >
                  <option value="">All roles</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="mt-3 text-xs font-semibold text-clinical-700 hover:underline"
              onClick={() => setDraftPrefs({ ...DEFAULT_CASE_LIST_VIEW_PREFS })}
            >
              Reset to defaults
            </button>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeControls}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyControls}
                className="shrink-0 rounded-lg bg-clinical-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) closeDeleteModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-case-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="delete-case-title" className="text-lg font-bold text-slate-900">
              Delete this case?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This removes the entry permanently. You cannot undo it.
            </p>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-3 text-sm text-slate-800">
              <p className="font-semibold text-slate-900">{formatOperationTags(pendingDelete.operation)}</p>
              <p className="mt-1 text-slate-600">
                {formatCaseDateUK(pendingDelete.case_date)}
                {pendingDelete.hospital?.trim() ? ` · ${pendingDelete.hospital.trim()}` : ''}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={closeDeleteModal}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteCase()}
                className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
