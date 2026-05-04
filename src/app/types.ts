import type { SurgicalSpecialty } from './constants';
import { DEFAULT_SURGICAL_SPECIALTY } from './constants';

/** Stored in public.users.preferences (jsonb). */
export type Preferences = {
  /** Honourific (default Dr for everyone; not collected at signup). */
  title: string;
  fullName: string;
  gmcNumber: string;
  favouriteTags: string[];
  defaultCepod: string;
  defaultRole: string;
  defaultHospital: string;
  /** Default surgical specialty for new cases (chosen from app preset list). */
  defaultSpecialty: SurgicalSpecialty;
};

export const defaultPreferences = (): Preferences => ({
  title: 'Dr',
  fullName: '',
  gmcNumber: '',
  favouriteTags: [],
  defaultCepod: '',
  defaultRole: '',
  defaultHospital: '',
  defaultSpecialty: DEFAULT_SURGICAL_SPECIALTY,
});

/** One saved consultant (public.users.consultants JSON array). */
export type ConsultantEntry = {
  firstname: string;
  lastname: string;
  gmc: string;
};

/** public.users row */
export type UserRow = {
  id: string;
  email: string | null;
  preferences: Preferences;
  consultants: ConsultantEntry[];
  grade: string | null;
  created_at: string;
  updated_at: string;
};

/** public.cases row — FK column is user_id (Postgres reserves the name "user"). */
export type CaseRow = {
  id: string;
  user_id: string;
  case_date: string;
  specialty: string;
  /** Present after DB migration; treat missing as empty string. */
  hospital?: string;
  operation: unknown;
  cepod: string | null;
  consultant: unknown;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type View = 'auth' | 'case-form' | 'cases' | 'reports' | 'settings';
