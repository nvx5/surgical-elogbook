import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REPORT_PDF_FONT_PRESETS,
  REPORT_PDF_FORMATS,
  REPORT_PDF_SIZE_PRESETS,
  SURGICAL_SPECIALTIES,
  type ReportPdfFontFamily,
  type ReportPdfFormat,
  type ReportPdfSizePreset,
} from '../constants';
import { buildTrainingReportPdf } from '../pdf';
import type { CaseRow, Preferences } from '../types';
import { formatDateISO } from '../utils';

type Props = {
  supabase: SupabaseClient;
  prefs: Preferences;
  grade: string | null;
};

const REPORT_FETCH_LIMIT = 8000;

const DATE_ALL_TIME_FROM = '1900-01-01';

export function Reports({ supabase, prefs, grade }: Props) {
  const today = formatDateISO(new Date());
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return formatDateISO(d);
  }, []);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [specialty, setSpecialty] = useState('');
  const [format, setFormat] = useState<ReportPdfFormat>('normal');
  const [includeGmc, setIncludeGmc] = useState(true);
  const [includeGrade, setIncludeGrade] = useState(true);
  const [fontFamily, setFontFamily] = useState<ReportPdfFontFamily>('helvetica');
  const [fontSizePreset, setFontSizePreset] = useState<ReportPdfSizePreset>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function applyQuickRange(kind: '6m' | '1y' | '2y' | '4y' | 'all') {
    const end = formatDateISO(new Date());
    setTo(end);
    if (kind === 'all') {
      setFrom(DATE_ALL_TIME_FROM);
      return;
    }
    const start = new Date();
    if (kind === '6m') {
      start.setMonth(start.getMonth() - 6);
    } else if (kind === '1y') {
      start.setFullYear(start.getFullYear() - 1);
    } else if (kind === '2y') {
      start.setFullYear(start.getFullYear() - 2);
    } else {
      start.setFullYear(start.getFullYear() - 4);
    }
    setFrom(formatDateISO(start));
  }

  async function generate() {
    setError(null);
    setWarning(null);
    setBusy(true);
    try {
      let q = supabase
        .from('cases')
        .select('*')
        .gte('case_date', from)
        .lte('case_date', to)
        .order('case_date', { ascending: true })
        .limit(REPORT_FETCH_LIMIT);

      const sp = specialty.trim();
      if (sp) {
        q = q.eq('specialty', sp);
      }

      const { data, error: err } = await q;
      if (err) throw err;
      const rows = (data ?? []) as CaseRow[];
      if (rows.length >= REPORT_FETCH_LIMIT) {
        setWarning(
          `Report includes only the first ${REPORT_FETCH_LIMIT} cases matching these filters. Narrow the range or export JSON for a full archive.`,
        );
      }

      const headerNotes: string[] = [];
      if (sp) {
        headerNotes.push(`Filtered to specialty: ${sp}`);
      }

      buildTrainingReportPdf({
        prefs,
        grade,
        cases: rows,
        dateFrom: from,
        dateTo: to,
        format,
        includeGmc,
        includeGrade,
        fontFamily,
        fontSizePreset,
        headerNotes,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not build report');
    } finally {
      setBusy(false);
    }
  }

  const rangeInvalid = from > to;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">Consolidation</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reports</h1>
      <p className="mt-2 w-full text-sm leading-relaxed text-slate-600">
        PDFs are generated on your device only, so nothing is uploaded. If the network is slow, narrow the date range or
        specialty filter so the download finishes sooner.
      </p>
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card" role="alert">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card" role="status">
          {warning}
        </p>
      ) : null}

      <div className="mt-6 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filters</h2>
        <div>
          <span className="text-xs font-medium text-slate-600">Quick date range</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => applyQuickRange('6m')}
            >
              Past 6 months
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => applyQuickRange('1y')}
            >
              Past year
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => applyQuickRange('2y')}
            >
              Past 2 years
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => applyQuickRange('4y')}
            >
              Past 4 years
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => applyQuickRange('all')}
            >
              All time
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="rep-from">
              From
            </label>
            <input
              id="rep-from"
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="rep-to">
              To
            </label>
            <input
              id="rep-to"
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="rep-specialty">
            Specialty
          </label>
          <select
            id="rep-specialty"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">All specialties</option>
            {SURGICAL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PDF preferences</h2>
        <div>
          <span className="text-xs font-medium text-slate-600">Format</span>
          <div className="mt-2 space-y-2">
            {REPORT_PDF_FORMATS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50 has-[:checked]:shadow-sm"
              >
                <input
                  type="radio"
                  name="report-pdf-format"
                  className="mt-0.5 shrink-0"
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{opt.label}</span>
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-600">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-600">Details</span>
          <div className="mt-2 space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-clinical-600 focus:ring-clinical-500"
                checked={includeGmc}
                onChange={(e) => setIncludeGmc(e.target.checked)}
              />
              <span className="min-w-0 leading-snug">
                <span className="block font-semibold text-slate-900">Include GMC number</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">Printed under trainee details when set in Settings.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition has-[:checked]:border-clinical-500 has-[:checked]:bg-clinical-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-clinical-600 focus:ring-clinical-500"
                checked={includeGrade}
                onChange={(e) => setIncludeGrade(e.target.checked)}
              />
              <span className="min-w-0 leading-snug">
                <span className="block font-semibold text-slate-900">Include grade</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">Your training grade from your profile.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="rep-font-family">
              Font family
            </label>
            <select
              id="rep-font-family"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as ReportPdfFontFamily)}
            >
              {REPORT_PDF_FONT_PRESETS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="rep-font-size">
              Font size
            </label>
            <select
              id="rep-font-size"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none transition focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25"
              value={fontSizePreset}
              onChange={(e) => setFontSizePreset(e.target.value as ReportPdfSizePreset)}
            >
              {REPORT_PDF_SIZE_PRESETS.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || rangeInvalid}
        onClick={() => void generate()}
        className="mt-6 w-full rounded-xl bg-clinical-600 px-4 py-3.5 font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-50"
      >
        {busy ? 'Preparing…' : 'Download PDF'}
      </button>
      {rangeInvalid ? (
        <p className="mt-2 text-center text-xs text-red-700" role="status">
          “From” date must be on or before “To”.
        </p>
      ) : null}
    </div>
  );
}
