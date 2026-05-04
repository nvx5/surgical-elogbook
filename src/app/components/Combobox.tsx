import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DefaultPrefStar } from './DefaultPrefStar';

export type ComboboxDefaultFavorite = {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  busy?: boolean;
};

type Props = {
  id?: string;
  label: string;
  /** Smaller label and control (e.g. settings panels). */
  variant?: 'default' | 'compact';
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  /** Show a row to commit the current input as a custom value */
  allowCustom?: boolean;
  /** Show a button to clear the value (sets empty string) */
  clearable?: boolean;
  /** Star control next to Clear — shown only when value is non-empty. */
  defaultFavorite?: ComboboxDefaultFavorite;
  maxSuggestions?: number;
  disabled?: boolean;
};

export function Combobox({
  id: idProp,
  label,
  variant = 'default',
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  allowCustom = true,
  clearable = false,
  defaultFavorite,
  maxSuggestions = 12,
  disabled = false,
}: Props) {
  const reactId = useId();
  const id = idProp ?? `cb-${reactId}`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [...options].slice(0, maxSuggestions);
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, maxSuggestions);
  }, [input, options, maxSuggestions]);

  const exactMatch = useMemo(
    () => options.some((o) => o.toLowerCase() === input.trim().toLowerCase()),
    [input, options],
  );

  const showCustomRow =
    allowCustom && input.trim().length > 0 && !exactMatch && !filtered.includes(input.trim());

  function pick(v: string) {
    onChange(v);
    setInput(v);
    setOpen(false);
  }

  const compact = variant === 'compact';
  const labelClass = compact
    ? 'flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600'
    : 'flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700';
  const shellClass = compact
    ? 'mt-1 flex w-full min-h-0 items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition focus-within:border-clinical-500 focus-within:ring-2 focus-within:ring-clinical-500/25'
    : 'mt-1.5 flex w-full min-h-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-clinical-500 focus-within:ring-2 focus-within:ring-clinical-500/25';
  const inputClass = compact
    ? 'min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none ring-0 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50'
    : 'min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base outline-none ring-0 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50';
  const segmentBtn =
    'inline-flex shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50/90 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
  const clearBtnClass = compact ? `${segmentBtn} px-2.5 py-2 text-xs font-semibold` : `${segmentBtn} px-3 py-2 text-sm font-semibold`;
  const chevronBtnClass = compact ? `${segmentBtn} min-w-[2.35rem] px-2` : `${segmentBtn} min-w-[2.65rem] px-2.5`;

  const chevronIcon = (
    <svg className={compact ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <div ref={wrapRef} className="relative">
      <label className={labelClass} htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className={shellClass}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClass}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length === 1) pick(filtered[0]);
              else if (exactMatch) pick(input.trim());
              else if (showCustomRow) pick(input.trim());
            }
          }}
        />
        {clearable && value ? (
          <button
            type="button"
            disabled={disabled}
            className={clearBtnClass}
            onClick={() => pick('')}
            title="Clear"
          >
            Clear
          </button>
        ) : null}
        {defaultFavorite && value.trim() ? (
          <DefaultPrefStar
            active={defaultFavorite.active}
            disabled={disabled || defaultFavorite.disabled}
            busy={defaultFavorite.busy}
            onToggle={defaultFavorite.onToggle}
            size={compact ? 'sm' : 'md'}
          />
        ) : null}
        <button
          type="button"
          disabled={disabled}
          className={chevronBtnClass}
          title="Open list"
          aria-label="Open list"
          onClick={() => setOpen((o) => !o)}
        >
          {chevronIcon}
        </button>
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200/90 bg-white py-1 shadow-card ring-1 ring-slate-900/5"
        >
          {filtered.length === 0 && !showCustomRow ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
          ) : null}
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-clinical-50 hover:text-clinical-900"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt}
              </button>
            </li>
          ))}
          {showCustomRow ? (
            <li>
              <button
                type="button"
                className="w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-clinical-800 hover:bg-clinical-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(input.trim())}
              >
                Use “{input.trim()}”
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
