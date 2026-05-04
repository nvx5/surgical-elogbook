import type { ReactNode } from 'react';
import type { View } from '../types';
import { AppMarketingFooter } from './AppMarketingFooter';

/** Routes shown in the header tab bar (case form is opened from Cases only). */
export type ChromeNavId = 'cases' | 'reports' | 'settings';

type Props = {
  current: View;
  onNavigate: (v: ChromeNavId) => void;
  /** Name and grade on one line (shown in uppercase like the old training-log line). */
  userSubtitle: string;
  totalCases: number | null;
  totalCasesLoading: boolean;
  onSignOut: () => void;
  children: ReactNode;
};

const nav: { id: ChromeNavId; label: string; icon: 'list' | 'chart' | 'gear' }[] = [
  { id: 'cases', label: 'Cases', icon: 'list' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

function Icon({ name, className }: { name: (typeof nav)[number]['icon']; className?: string }) {
  const c = className ?? 'h-5 w-5';
  switch (name) {
    case 'list':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm0 5.25h.007v.008H3.75V12Zm0 5.25h.007v.008H3.75v-.008Z" />
        </svg>
      );
    case 'chart':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      );
    case 'gear':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.37.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.37-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      );
    default:
      return null;
  }
}

function NavTab({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: (typeof nav)[number];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[3rem] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-center text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-clinical-500 sm:flex-row sm:gap-2 sm:text-sm ${
        active
          ? 'bg-white text-clinical-800 shadow-[inset_0_3px_0_0_theme(colors.clinical.600)]'
          : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
      }`}
    >
      <span className={active ? 'text-clinical-600' : 'text-slate-400'} aria-hidden>
        <Icon name={item.icon} />
      </span>
      <span className="leading-tight">{item.label}</span>
    </button>
  );
}

export function AppChrome({
  current,
  onNavigate,
  userSubtitle,
  totalCases,
  totalCasesLoading,
  onSignOut,
  children,
}: Props) {
  const totalLabel =
    totalCasesLoading || totalCases == null ? '…' : `${totalCases.toLocaleString()} ${totalCases === 1 ? 'case' : 'cases'}`;

  return (
    <div className="flex min-h-screen flex-col bg-surface text-slate-900">
      <header className="sticky top-0 z-50 shadow-sm" role="banner">
        <div className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:items-center">
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <span className="text-base font-bold tracking-tight text-clinical-600">Surgical</span>
                <span className="text-base font-bold tracking-tight text-slate-900">eLogbook</span>
              </div>
              <p
                className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-slate-400"
                title={userSubtitle}
              >
                {userSubtitle}
              </p>
            </div>
            <div className="flex h-11 shrink-0 items-stretch gap-2 sm:gap-2.5">
              <div
                className="flex min-w-[6.75rem] flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 tabular-nums sm:min-w-[7.25rem] sm:px-3.5"
                title="Total cases in your logbook"
              >
                <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400">Total</span>
                <span className="mt-0.5 text-sm font-bold leading-none text-slate-900">{totalLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 sm:px-4"
              >
                Log out
              </button>
            </div>
          </div>
        </div>

        <nav
          className="border-b border-slate-200/90 bg-slate-100/95 backdrop-blur-sm"
          aria-label="Main navigation"
        >
          <div className="mx-auto flex max-w-6xl">
            {nav.map((item) => (
              <NavTab
                key={item.id}
                item={item}
                active={current === item.id || (item.id === 'cases' && current === 'case-form')}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</main>

      <AppMarketingFooter />
    </div>
  );
}
