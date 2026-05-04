import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalSpecialty,
  CE_POD_OPTIONS,
  NAME_TITLES,
  OPERATION_TAG_SUGGESTIONS,
  ROLES,
  SURGICAL_SPECIALTIES,
  TRAINING_GRADES,
} from '../constants';
import { exportCasesCsv, exportFullJson } from '../export';
import type { CaseRow, ConsultantEntry, Preferences, UserRow } from '../types';
import { parseConsultantsList, parsePreferences } from '../utils';
import { isOfficialUkNhsTrustName, UK_NHS_TRUSTS } from '../ukNhsTrusts';
import { Combobox } from './Combobox';

type Props = {
  supabase: SupabaseClient;
  userId: string;
  userRow: UserRow | null;
  prefs: Preferences;
  onUserUpdated: (u: UserRow) => void;
  /** Pass a notice to show on the sign-in screen if Auth login could not be removed (e.g. Edge Function not deployed). */
  onSignedOut: (postDeleteNotice?: string | null) => void;
};

function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id),
    email: row.email != null ? String(row.email) : null,
    preferences: parsePreferences(row.preferences),
    consultants: parseConsultantsList(row.consultants),
    grade: row.grade != null ? String(row.grade) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function Settings({
  supabase,
  userId,
  userRow,
  prefs,
  onUserUpdated,
  onSignedOut,
}: Props) {
  const [formPrefs, setFormPrefs] = useState<Preferences>(prefs);
  const [favTags, setFavTags] = useState<string[]>(prefs.favouriteTags);
  const [favTagInput, setFavTagInput] = useState('');
  const [grade, setGrade] = useState(userRow?.grade ?? '');
  const [consultants, setConsultants] = useState<ConsultantEntry[]>(userRow?.consultants ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const deletePasswordInputRef = useRef<HTMLInputElement>(null);

  const favTagSuggestions = useMemo(() => {
    const q = favTagInput.trim().toLowerCase();
    const pool = [...new Set([...OPERATION_TAG_SUGGESTIONS, ...favTags])].sort((a, b) => a.localeCompare(b));
    const picked = new Set(favTags.map((t) => t.toLowerCase()));
    const list = !q
      ? pool.filter((t) => !picked.has(t.toLowerCase())).slice(0, 14)
      : pool
          .filter((t) => !picked.has(t.toLowerCase()) && t.toLowerCase().includes(q))
          .slice(0, 14);
    return list;
  }, [favTagInput, favTags]);

  useEffect(() => {
    setFormPrefs(prefs);
    setFavTags(prefs.favouriteTags);
    setFavTagInput('');
  }, [prefs]);

  useEffect(() => {
    setGrade(userRow?.grade ?? '');
    setConsultants(userRow?.consultants ?? []);
  }, [userRow]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setDeletePassword('');
    setDeleteModalError(null);
  }, []);

  const openDeleteModal = useCallback(() => {
    setDeletePassword('');
    setDeleteModalError(null);
    setDeleteModalOpen(true);
  }, []);

  useEffect(() => {
    if (!deleteModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !wiping) closeDeleteModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteModalOpen, closeDeleteModal, wiping]);

  useEffect(() => {
    if (!deleteModalOpen) return;
    const t = window.setTimeout(() => deletePasswordInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [deleteModalOpen]);

  function addFavouriteTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setFavTags((prev) => {
      if (prev.some((x) => x.toLowerCase() === t.toLowerCase())) return prev;
      return [...prev, t];
    });
    setFavTagInput('');
  }

  function removeFavouriteTag(i: number) {
    setFavTags((prev) => prev.filter((_, j) => j !== i));
  }

  async function saveAll() {
    setError(null);
    setSaving(true);
    const nextPrefs: Preferences = { ...formPrefs, favouriteTags: favTags };
    if (!canonicalSpecialty(nextPrefs.defaultSpecialty)) {
      setError('Choose a default surgical specialty from the list.');
      setSaving(false);
      return;
    }
    const dh = nextPrefs.defaultHospital.trim();
    if (dh && !isOfficialUkNhsTrustName(dh)) {
      setError('Default trust must be chosen from the official list.');
      setSaving(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('users')
        .update({
          preferences: nextPrefs as unknown as Record<string, unknown>,
          consultants,
          grade: grade.trim() || null,
        })
        .eq('id', userId)
        .select('*')
        .single();
      if (err) throw err;
      onUserUpdated(rowToUser(data as Record<string, unknown>));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  async function runExport(kind: 'csv' | 'json') {
    setExporting(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from('cases').select('*').order('case_date', { ascending: false });
      if (err) throw err;
      const cases = (data ?? []) as CaseRow[];
      if (kind === 'csv') exportCasesCsv(cases);
      else {
        const u: UserRow | null = userRow
          ? {
              ...userRow,
              preferences: { ...formPrefs, favouriteTags: favTags },
              consultants,
              grade: grade.trim() || null,
            }
          : null;
        exportFullJson(u, cases);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function wipeData() {
    setDeleteModalError(null);
    const pwd = deletePassword.trim();
    const { data: authData, error: userErr } = await supabase.auth.getUser();
    const email = authData.user?.email?.trim();
    if (userErr || !email) {
      setDeleteModalError('Could not read your sign-in email.');
      return;
    }
    if (!pwd) {
      setDeleteModalError('Enter your password.');
      return;
    }
    setWiping(true);
    try {
      const { error: pwErr } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (pwErr) {
        const msg = pwErr.message || '';
        setDeleteModalError(
          /invalid login|invalid credentials/i.test(msg)
            ? 'Incorrect password.'
            : msg || 'Could not verify password. Magic-link-only accounts have no password to use here.',
        );
        return;
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'delete-auth-user',
        { method: 'POST' },
      );

      const fnOk = !fnError && fnData && typeof fnData === 'object' && fnData.ok === true;

      if (fnOk) {
        closeDeleteModal();
        await supabase.auth.signOut();
        onSignedOut();
        return;
      }

      const { error: d1 } = await supabase.from('cases').delete().eq('user_id', userId);
      if (d1) throw d1;
      const { error: d2 } = await supabase.from('users').delete().eq('id', userId);
      if (d2) throw d2;
      closeDeleteModal();
      await supabase.auth.signOut();

      const fnErrText = fnError?.message?.trim() ?? '';
      const fnBodyErr =
        fnData && typeof fnData === 'object' && typeof fnData.error === 'string' ? fnData.error : '';
      const detail = [fnErrText, fnBodyErr].filter(Boolean).join(' — ');
      onSignedOut(
        detail
          ? `Your logbook data was removed, but the Auth user may still exist (${detail}). Deploy the delete-auth-user Edge Function (see README) or remove the user in Supabase → Authentication → Users so this email can sign up again.`
          : 'Your logbook data was removed, but the Auth user could not be deleted automatically. Deploy the delete-auth-user Edge Function (see README) or remove the user in Supabase → Authentication → Users so this email can sign up again.',
      );
    } catch (e: unknown) {
      setDeleteModalError(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setWiping(false);
    }
  }

  function updateConsultant(i: number, field: keyof ConsultantEntry, value: string) {
    setConsultants((list) => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">User</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
      <p className="mt-2 w-full text-sm leading-relaxed text-slate-600">
        Change your account details, defaults for new cases, favourite tags for suggestions on new cases, and use the
        Data section for exports or permanent deletion.
      </p>
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,5.5rem)_1fr] sm:items-end">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="title">
              Title
            </label>
            <select
              id="title"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={formPrefs.title}
              onChange={(e) => setFormPrefs((f) => ({ ...f, title: e.target.value }))}
            >
              {NAME_TITLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="fullName">
              Name
            </label>
            <input
              id="fullName"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={formPrefs.fullName}
              onChange={(e) => setFormPrefs((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="As on your training records"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="grade">
              Grade
            </label>
            <select
              id="grade"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">—</option>
              {TRAINING_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="gmc">
              GMC
            </label>
            <input
              id="gmc"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={formPrefs.gmcNumber}
              onChange={(e) => setFormPrefs((f) => ({ ...f, gmcNumber: e.target.value }))}
              placeholder="Optional"
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preferences</h2>
        <Combobox
          id="def-hospital"
          label="Default Trust"
          variant="compact"
          value={formPrefs.defaultHospital}
          onChange={(v) => setFormPrefs((f) => ({ ...f, defaultHospital: v }))}
          options={UK_NHS_TRUSTS}
          placeholder="Search NHS trusts and health boards…"
          allowCustom={false}
          clearable
        />
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="def-cepod">
            Default CEPOD
          </label>
          <select
            id="def-cepod"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={formPrefs.defaultCepod}
            onChange={(e) => setFormPrefs((f) => ({ ...f, defaultCepod: e.target.value }))}
          >
            <option value="">—</option>
            {CE_POD_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="def-role">
            Default Role
          </label>
          <select
            id="def-role"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={formPrefs.defaultRole}
            onChange={(e) => setFormPrefs((f) => ({ ...f, defaultRole: e.target.value }))}
          >
            <option value="">—</option>
            {ROLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="def-specialty">
            Default specialty
          </label>
          <select
            id="def-specialty"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={formPrefs.defaultSpecialty}
            onChange={(e) =>
              setFormPrefs((f) => ({ ...f, defaultSpecialty: e.target.value as Preferences['defaultSpecialty'] }))
            }
          >
            {SURGICAL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-xs font-medium text-slate-600">Favourite tags</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {favTags.map((t, i) => (
              <button
                key={`${t}-${i}`}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-clinical-100 px-2.5 py-0.5 text-left text-xs font-medium text-clinical-900 transition hover:bg-clinical-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-500/40"
                aria-label={`Remove ${t}`}
                onClick={() => removeFavouriteTag(i)}
              >
                <span className="min-w-0">{t}</span>
                <span className="shrink-0 text-clinical-700" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex w-full min-h-0 items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition focus-within:border-clinical-500 focus-within:ring-2 focus-within:ring-clinical-500/25">
            <input
              className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 text-sm outline-none ring-0 placeholder:text-slate-400"
              placeholder="Type a tag and press Add"
              value={favTagInput}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setFavTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFavouriteTag(favTagInput);
                }
              }}
            />
            <button
              type="button"
              className="shrink-0 border-l border-slate-200 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              onClick={() => addFavouriteTag(favTagInput)}
            >
              Add tag
            </button>
          </div>
          {favTagSuggestions.length > 0 ? (
            <div className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/80 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Suggestions</div>
              <div className="flex flex-wrap gap-1">
                {favTagSuggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-full border border-clinical-200 bg-white px-2 py-0.5 text-[11px] font-medium text-clinical-900 shadow-sm hover:bg-clinical-50"
                    onClick={() => addFavouriteTag(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-card sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved consultants</h2>
          <button
            type="button"
            title="Add consultant"
            aria-label="Add consultant"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setConsultants((c) => [...c, { firstname: '', lastname: '', gmc: '' }])}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M12 4.5v15M4.5 12h15" />
            </svg>
          </button>
        </div>
        {consultants.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-500">None yet — use + to add rows for case forms.</p>
        ) : (
          <div className="mt-2 -mx-1 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[28rem] table-fixed border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-bold">First name</th>
                  <th className="px-2 py-1.5 font-bold">Last name</th>
                  <th className="w-[5.5rem] px-2 py-1.5 font-bold">GMC</th>
                  <th className="w-[5rem] px-2 py-1.5 text-right font-bold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consultants.map((c, i) => (
                  <tr key={i} className="align-middle">
                    <td className="px-2 py-1.5">
                      <input
                        className="w-full min-w-0 border-0 bg-transparent px-1 py-1 text-xs shadow-none outline-none ring-0 transition placeholder:text-slate-400 focus:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-clinical-500/25"
                        placeholder="First"
                        value={c.firstname}
                        onChange={(e) => updateConsultant(i, 'firstname', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="w-full min-w-0 border-0 bg-transparent px-1 py-1 text-xs shadow-none outline-none ring-0 transition placeholder:text-slate-400 focus:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-clinical-500/25"
                        placeholder="Last"
                        value={c.lastname}
                        onChange={(e) => updateConsultant(i, 'lastname', e.target.value)}
                      />
                    </td>
                    <td className="w-[5.5rem] px-2 py-1.5">
                      <input
                        className="w-full max-w-[5.25rem] border-0 bg-transparent px-1 py-1 text-xs shadow-none outline-none ring-0 transition placeholder:text-slate-400 focus:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-clinical-500/25"
                        placeholder="GMC"
                        value={c.gmc}
                        onChange={(e) => updateConsultant(i, 'gmc', e.target.value)}
                      />
                    </td>
                    <td className="w-[5rem] whitespace-nowrap px-2 py-1.5 text-right">
                      <button
                        type="button"
                        className="font-semibold text-red-700 hover:underline"
                        onClick={() => setConsultants((list) => list.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void saveAll()}
        className="mt-6 w-full rounded-xl bg-clinical-600 px-4 py-3.5 font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>

      <div className="mt-4 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-card sm:p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void runExport('csv')}
            className="min-w-[6.5rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void runExport('json')}
            className="min-w-[6.5rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Export JSON
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={openDeleteModal}
            className="min-w-[6.5rem] flex-1 rounded-lg bg-red-700 px-2 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-50 sm:flex-none"
          >
            Delete all data
          </button>
        </div>
      </div>

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !wiping) closeDeleteModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="delete-modal-title" className="text-lg font-bold text-slate-900">
              Delete all data?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This permanently deletes your logbook, profile, and sign-in. You cannot undo this.
            </p>
            <p className="mt-3 text-sm text-slate-700">Enter your password to confirm.</p>
            <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor="delete-confirm-password">
              Password
            </label>
            <input
              ref={deletePasswordInputRef}
              id="delete-confirm-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            />
            {deleteModalError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {deleteModalError}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={wiping}
                onClick={closeDeleteModal}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={wiping || !deletePassword.trim()}
                onClick={() => void wipeData()}
                className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-50"
              >
                {wiping ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
