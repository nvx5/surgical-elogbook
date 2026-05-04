import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRAINING_GRADES } from '../constants';

type Props = {
  supabase: SupabaseClient;
  onAuthed: () => void;
  postSignOutNotice?: string | null;
  onDismissPostSignOutNotice?: () => void;
  /** User followed the reset link from email; session is a recovery session until password is updated. */
  passwordRecovery?: boolean;
  onPasswordRecoveryDone?: () => void;
};

function passwordResetRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/app/`;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-clinical-500 focus:ring-2 focus:ring-clinical-500/25';

const footerLinks: readonly [string, string][] = [
  ['About', '/about/'],
  ['Legal', '/legal/'],
  ['Contact', 'mailto:surgicalelogbook@proton.me'],
];

function AuthIntegratedFooter() {
  return (
    <div className="mt-8 text-center">
      <p className="text-[11px] font-medium leading-snug text-slate-600">Built by surgeons, for surgeons.</p>
      <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-1" aria-label="Legal and information">
        {footerLinks.map(([label, href], i) => (
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
    </div>
  );
}

export function Auth({
  supabase,
  onAuthed,
  postSignOutNotice,
  onDismissPostSignOutNotice,
  passwordRecovery = false,
  onPasswordRecoveryDone,
}: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!fullName.trim()) {
          setError('Please enter your name.');
          setLoading(false);
          return;
        }
        if (!grade) {
          setError('Please select your training grade.');
          setLoading(false);
          return;
        }
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              grade,
            },
          },
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      onAuthed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: passwordResetRedirectUrl(),
      });
      if (err) throw err;
      setForgotSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoverySubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setNewPassword('');
      setConfirmNewPassword('');
      onPasswordRecoveryDone?.();
      onAuthed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  const stepLabel = passwordRecovery
    ? 'Set password'
    : mode === 'signup'
      ? 'Step 1 of 1 · Account'
      : mode === 'forgot'
        ? 'Reset access'
        : 'Welcome back';

  return (
    <div className="flex min-h-screen flex-col bg-surface font-sans">
      {postSignOutNotice ? (
        <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-3">
          <div className="mx-auto flex max-w-md gap-3 sm:max-w-lg">
            <p className="min-w-0 flex-1 text-sm text-amber-950">{postSignOutNotice}</p>
            {onDismissPostSignOutNotice ? (
              <button
                type="button"
                className="shrink-0 text-sm font-semibold text-amber-900 underline"
                onClick={() => onDismissPostSignOutNotice()}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <a href="/about/" className="inline-flex flex-wrap items-baseline justify-center gap-x-1.5 font-bold tracking-tight">
              <span className="text-2xl text-clinical-600 sm:text-3xl">Surgical</span>
              <span className="text-2xl text-slate-900 sm:text-3xl">eLogbook</span>
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card sm:p-8">
            {passwordRecovery ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">{stepLabel}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Set new password</h2>
                <p className="mt-1 text-sm text-slate-500">Choose a new password for your account, then continue.</p>
                <form className="mt-8 space-y-4" onSubmit={handleRecoverySubmit}>
                  <div>
                    <label className="text-sm font-semibold text-slate-700" htmlFor="new-password-recovery">
                      New password
                    </label>
                    <input
                      id="new-password-recovery"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      className={inputClass}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700" htmlFor="confirm-new-password-recovery">
                      Confirm new password
                    </label>
                    <input
                      id="confirm-new-password-recovery"
                      name="confirmNewPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      className={inputClass}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                  </div>
                  {error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full justify-center rounded-xl bg-clinical-600 px-4 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-60"
                  >
                    {loading ? 'Please wait…' : 'Update password'}
                  </button>
                </form>
              </>
            ) : forgotSent && mode === 'forgot' ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">{stepLabel}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Check your email</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  If that address is registered, you will receive a message with a link. Open it on this device to
                  choose a new password.
                </p>
                <button
                  type="button"
                  className="mt-8 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => {
                    setMode('login');
                    setForgotSent(false);
                    setError(null);
                  }}
                >
                  Back to sign in
                </button>
              </>
            ) : mode === 'forgot' ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">{stepLabel}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Forgot password?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter your account email. We will send a link that opens this app so you can set a new password.
                </p>
                <form className="mt-8 space-y-4" onSubmit={handleForgotSubmit}>
                  <div>
                    <label className="text-sm font-semibold text-slate-700" htmlFor="email-forgot">
                      Email
                    </label>
                    <input
                      id="email-forgot"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={inputClass}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full justify-center rounded-xl bg-clinical-600 px-4 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-60"
                  >
                    {loading ? 'Please wait…' : 'Send reset link'}
                  </button>
                </form>
                <button
                  type="button"
                  className="mt-6 w-full text-center text-sm font-semibold text-clinical-700 hover:text-clinical-800 hover:underline"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setForgotSent(false);
                  }}
                >
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-clinical-600">{stepLabel}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {mode === 'login' ? 'Sign in' : 'Create your account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {mode === 'login'
                    ? 'Use the email and password you registered with.'
                    : 'Add your details, then choose email and password.'}
                </p>

                <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                  {mode === 'signup' ? (
                    <>
                      <div>
                        <label className="text-sm font-semibold text-slate-700" htmlFor="fullName">
                          Full name
                        </label>
                        <input
                          id="fullName"
                          name="fullName"
                          type="text"
                          autoComplete="name"
                          required
                          className={inputClass}
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="As you want it on reports"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700" htmlFor="grade">
                          Training grade
                        </label>
                        <select
                          id="grade"
                          name="grade"
                          required
                          className={inputClass}
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                        >
                          <option value="">Select grade…</option>
                          {TRAINING_GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <label className="text-sm font-semibold text-slate-700" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={inputClass}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="password">
                        Password
                      </label>
                      {mode === 'login' ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-clinical-700 hover:text-clinical-800 hover:underline"
                          onClick={() => {
                            setMode('forgot');
                            setError(null);
                            setForgotSent(false);
                          }}
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={6}
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full justify-center rounded-xl bg-clinical-600 px-4 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-clinical-700 hover:shadow-card-hover disabled:opacity-60"
                  >
                    {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </form>
                <button
                  type="button"
                  className="mt-6 w-full text-center text-sm font-semibold text-clinical-700 hover:text-clinical-800 hover:underline"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError(null);
                    setForgotSent(false);
                    setFullName('');
                    setGrade('');
                  }}
                >
                  {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
                </button>
              </>
            )}
          </div>

          <AuthIntegratedFooter />
        </div>
      </div>
    </div>
  );
}
