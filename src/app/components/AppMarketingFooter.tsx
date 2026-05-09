/** Help / marketing footer: shown under the signed-in shell and on the auth screen. */
export function AppMarketingFooter() {
  const links: readonly [string, string][] = [
    ['About', '/about/'],
    ['Help', '/help/'],
  ];

  return (
    <footer
      className="border-t border-slate-200/90 bg-white/90 px-4 py-4 text-center backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 sm:px-6"
      role="contentinfo"
    >
      <p className="text-[11px] font-medium leading-snug text-slate-600">Built by surgeons, for surgeons.</p>
      <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-1" aria-label="Help and information">
        {links.map(([label, href], i) => (
          <span key={href} className="inline-flex items-center gap-x-1">
            {i > 0 ? (
              <span className="text-[10px] font-bold text-slate-300" aria-hidden>
                •
              </span>
            ) : null}
            <a
              href={href}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-clinical-700"
            >
              {label}
            </a>
          </span>
        ))}
      </nav>
    </footer>
  );
}
