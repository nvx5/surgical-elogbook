-- Drop legacy specialty whitelist constraint (if present).
-- Use this alone when cases.specialty already exists and you only need to remove DB-side enumeration.
-- Preset specialties remain enforced via the app's SURGICAL_SPECIALTIES dropdowns.

alter table public.cases drop constraint if exists cases_specialty_allowed;

comment on column public.cases.specialty is 'Surgical specialty label (plain text). Preset options are enforced in the app only.';

notify pgrst, 'reload schema';
