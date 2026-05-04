import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ConsultantEntry } from '../types';
import { formatSavedConsultantPickLabel } from '../utils';

type Props = {
  label?: string;
  consultants: ConsultantEntry[];
  onPick: (c: ConsultantEntry) => void;
};

export function ConsultantSavedPicker({
  label = 'Pick from saved consultants',
  consultants,
  onPick,
}: Props) {
  const id = useId();
  const listId = `${id}-saved-cons`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return consultants.slice(0, 10);
    return consultants
      .filter((c) =>
        [c.firstname, c.lastname, c.gmc].some((f) => f.toLowerCase().includes(t)),
      )
      .slice(0, 10);
  }, [q, consultants]);

  if (consultants.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1.5 flex w-full min-h-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-clinical-500 focus-within:ring-2 focus-within:ring-clinical-500/25">
        <input
          id={`${id}-q`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search saved…"
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base outline-none ring-0 placeholder:text-slate-400"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="inline-flex min-w-[2.65rem] shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50/90 px-2.5 text-slate-600 transition hover:bg-slate-100"
          title="Open list"
          aria-label="Open list"
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="h-[1.125rem] w-[1.125rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
          ) : (
            filtered.map((c, i) => (
              <li key={`${c.firstname}-${c.lastname}-${c.gmc}-${i}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-clinical-50 hover:text-clinical-900"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(c);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  {formatSavedConsultantPickLabel(c)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
