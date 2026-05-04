type Props = {
  /** Saved preference matches this field’s current value. */
  active: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** Hide entirely when there is nothing meaningful to pin (e.g. empty trust). */
  visible?: boolean;
  /** Visual size to match Combobox segments vs section headers. */
  size?: 'md' | 'sm';
};

export function DefaultPrefStar({ active, disabled, busy, onToggle, visible = true, size = 'md' }: Props) {
  if (!visible) return null;

  const iconClass = size === 'sm' ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]';
  const btnClass =
    size === 'sm'
      ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-500 transition hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40'
      : 'inline-flex min-w-[2.65rem] shrink-0 items-center justify-center self-stretch border-l border-slate-200 bg-slate-50/90 px-2 py-2.5 text-amber-500 transition hover:bg-amber-50/90 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40';

  const title = active ? 'Remove as default for new cases' : 'Set as default for new cases';

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onToggle}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={btnClass}
    >
      {busy ? (
        <span className={`inline-block animate-spin rounded-full border-2 border-amber-400 border-t-transparent ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} aria-hidden />
      ) : active ? (
        <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.083-5.006z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      )}
    </button>
  );
}
