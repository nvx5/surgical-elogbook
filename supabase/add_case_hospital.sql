-- -----------------------------------------------------------------------------
-- Add `hospital` to `public.cases` (older projects created before this column).
-- Run once in Supabase → SQL Editor, then refresh the app.
--
-- Fixes API error: "Could not find the 'hospital' column of 'cases' in the
-- schema cache" (PostgREST does not expose columns that are not in Postgres).
-- -----------------------------------------------------------------------------

alter table public.cases
  add column if not exists hospital text not null default '';

create index if not exists cases_user_hospital_idx on public.cases (user_id, hospital);

comment on column public.cases.hospital is
  'Optional UK hospital / trust site name from the app list; empty string if unset.';

-- Tell PostgREST to reload the schema cache so the API sees the new column immediately.
notify pgrst, 'reload schema';
