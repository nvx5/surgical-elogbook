import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { initSupabase } from './supabase';
import type { CaseRow, Preferences, UserRow, View } from './types';
import { defaultPreferences } from './types';
import {
  initialPreferencesFromAuth,
  parseConsultantsList,
  parsePreferences,
  profileFromAuthMetadata,
} from './utils';
import { Auth } from './components/Auth';
import { CaseForm } from './components/CaseForm';
import { CaseList } from './components/CaseList';
import { AppChrome, type ChromeNavId } from './components/AppChrome';
import { Settings } from './components/Settings';

const Reports = lazy(async () => import('./components/Reports').then((module) => ({ default: module.Reports })));

function mapUser(row: Record<string, unknown>): UserRow {
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

export default function App() {
  const supabase = initSupabase();

  const [session, setSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [postSignOutNotice, setPostSignOutNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>('auth');
  const [userRow, setUserRow] = useState<UserRow | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences());
  const [editingCase, setEditingCase] = useState<CaseRow | null>(null);
  const [lastCase, setLastCase] = useState<CaseRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [totalCases, setTotalCases] = useState<number | null>(null);
  const [totalCasesLoading, setTotalCasesLoading] = useState(false);

  const refreshTotalCases = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setTotalCasesLoading(true);
    try {
      const { count, error } = await supabase.from('cases').select('*', { count: 'exact', head: true });
      if (error) throw error;
      setTotalCases(count ?? 0);
    } catch {
      setTotalCases(null);
    } finally {
      setTotalCasesLoading(false);
    }
  }, [session, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setView('auth');
  }, [supabase]);

  useEffect(() => {
    if (!session?.user) {
      setTotalCases(null);
      return;
    }
    void refreshTotalCases();
  }, [session, refreshTotalCases]);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false);
      }
    });
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => subscription.unsubscribe();
  }, [supabase]);

  const loadUser = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const uid = session.user.id;
    const meta = session.user.user_metadata;
    const { fullName: metaName, grade: metaGrade } = profileFromAuthMetadata(meta);

    setProfileError(null);
    const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
    if (error) {
      setProfileError(error.message);
      return;
    }
    if (!data) {
      const preferences = initialPreferencesFromAuth(meta);
      const { error: insErr } = await supabase.from('users').insert({
        id: uid,
        email: session.user.email ?? null,
        preferences: preferences as unknown as Record<string, unknown>,
        consultants: [],
        grade: metaGrade,
      });
      if (insErr) {
        setProfileError(insErr.message);
        return;
      }
      const { data: again, error: err2 } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
      if (err2 || !again) {
        setProfileError(err2?.message ?? 'Could not load user profile');
        return;
      }
      const u = mapUser(again as Record<string, unknown>);
      setUserRow(u);
      setPrefs(u.preferences);
    } else {
      let u = mapUser(data as Record<string, unknown>);
      const prefsRow = u.preferences;
      const missingName = !prefsRow.fullName?.trim() && !!metaName;
      const missingGrade = (u.grade == null || u.grade === '') && !!metaGrade;
      if (missingName || missingGrade) {
        const nextPrefs = { ...prefsRow, fullName: missingName ? metaName : prefsRow.fullName };
        const nextGrade = missingGrade ? metaGrade : u.grade;
        const { error: upErr } = await supabase
          .from('users')
          .update({
            preferences: nextPrefs as unknown as Record<string, unknown>,
            grade: nextGrade,
          })
          .eq('id', uid);
        if (!upErr) {
          u = { ...u, preferences: nextPrefs, grade: nextGrade };
        }
      }
      setUserRow(u);
      setPrefs(u.preferences);
    }
    setView((v) => (v === 'auth' ? 'cases' : v));
  }, [session, supabase]);

  useEffect(() => {
    if (!session?.user) {
      setUserRow(null);
      setPrefs(defaultPreferences());
      setProfileError(null);
      setView('auth');
      return;
    }
    void loadUser();
  }, [session, loadUser]);

  useEffect(() => {
    if (!supabase || !session?.user) return;
    if (view !== 'case-form' || editingCase) return;
    void supabase
      .from('cases')
      .select('*')
      .order('case_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLastCase((data as CaseRow) ?? null));
  }, [supabase, session, view, editingCase]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-surface px-4 py-10 text-center font-sans">
        <p className="mx-auto max-w-md text-sm text-slate-700">
          Set <code className="rounded bg-slate-200 px-1">PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-200 px-1">PUBLIC_SUPABASE_ANON_KEY</code> in a{' '}
          <code className="rounded bg-slate-200 px-1">.env</code> file, then restart the dev server.
        </p>
      </div>
    );
  }

  if (!session?.user || passwordRecovery) {
    return (
      <Auth
        supabase={supabase}
        passwordRecovery={passwordRecovery}
        postSignOutNotice={postSignOutNotice}
        onDismissPostSignOutNotice={() => setPostSignOutNotice(null)}
        onAuthed={() => {
          setPostSignOutNotice(null);
          void supabase.auth.getSession().then(({ data }) => setSession(data.session));
        }}
        onPasswordRecoveryDone={() => setPasswordRecovery(false)}
      />
    );
  }

  const uid = session.user.id;
  const displayName = prefs.fullName?.trim() || session.user.email || 'Trainee';
  const displayGrade = userRow?.grade?.trim() ?? '';
  const userSubtitle = displayGrade ? `${displayName} · ${displayGrade}` : displayName;

  return (
    <AppChrome
      current={view}
      userSubtitle={userSubtitle}
      totalCases={totalCases}
      totalCasesLoading={totalCasesLoading}
      onSignOut={signOut}
      onNavigate={(v: ChromeNavId) => {
        setEditingCase(null);
        setView(v);
      }}
    >
      {view === 'case-form' ? (
        <CaseForm
          supabase={supabase}
          userId={uid}
          prefs={prefs}
          savedConsultants={userRow?.consultants ?? []}
          editing={editingCase}
          lastCase={lastCase}
          onUserDataUpdated={() => void loadUser()}
          onSaved={() => {
            setEditingCase(null);
            setView('cases');
            void refreshTotalCases();
          }}
          onCancel={() => {
            setEditingCase(null);
            setView('cases');
          }}
        />
      ) : null}
      {view === 'cases' ? (
        <CaseList
          supabase={supabase}
          onEdit={(c) => {
            setEditingCase(c);
            setView('case-form');
          }}
          onAddCase={() => {
            setEditingCase(null);
            setView('case-form');
          }}
          profileError={profileError}
          onCaseCountStale={() => void refreshTotalCases()}
        />
      ) : null}
      {view === 'reports' ? (
        <Suspense
          fallback={
            <div className="mx-auto max-w-6xl px-4 py-5 text-sm text-slate-600 sm:px-6 sm:py-6">Loading reports…</div>
          }
        >
          <Reports supabase={supabase} prefs={prefs} grade={userRow?.grade ?? null} />
        </Suspense>
      ) : null}
      {view === 'settings' ? (
        <Settings
          supabase={supabase}
          userId={uid}
          userRow={userRow}
          prefs={prefs}
          onUserUpdated={(u) => {
            setUserRow(u);
            setPrefs(u.preferences);
          }}
          onSignedOut={(notice) => {
            setSession(null);
            setView('auth');
            if (notice) setPostSignOutNotice(notice);
          }}
        />
      ) : null}
    </AppChrome>
  );
}
