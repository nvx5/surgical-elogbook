-- Surgical eLogbook — reset and create schema
-- Run in Supabase SQL Editor (fresh project or after backing up data).
--
-- Note on naming: the owning auth account is stored as user_id → auth.users(id).
-- It does NOT need to be called user_id for the link to work (any FK column name is fine),
-- but the column must NOT be named "user" (reserved in PostgreSQL).

-- -----------------------------------------------------------------------------
-- Tear down old objects (from previous MVP revision)
-- Do NOT drop triggers/policies by name on public.* here — if the table was never
-- created (fresh project), PostgreSQL errors: relation "public.cases" does not exist.
-- CASCADE removes triggers and RLS policies with the tables.
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.cases cascade;
drop table if exists public.profiles cascade;
drop table if exists public.users cascade;

-- -----------------------------------------------------------------------------
-- public.users (app profile; id = auth.users.id)
-- -----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  preferences jsonb not null default '{}'::jsonb,
  consultants jsonb not null default '[]'::jsonb,
  grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

comment on column public.users.consultants is
  'JSON array of saved consultants, e.g. [{"firstname":"Ann","lastname":"Smith","gmc":"1234567"}]';

-- -----------------------------------------------------------------------------
-- public.cases
-- -----------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_date date not null,
  specialty text not null,
  hospital text not null default '',
  operation jsonb not null default '[]'::jsonb,
  cepod text,
  consultant jsonb,
  role text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_operation_is_array check (jsonb_typeof(operation) = 'array')
);

comment on column public.cases.case_date is 'Operative / case date (logical "date" field).';
comment on column public.cases.specialty is 'Surgical specialty label (plain text). Preset options are enforced in the app only.';
comment on column public.cases.operation is
  'JSON array of operation tags, e.g. ["laparotomy","adhesiolysis","hartmann''s"] — display as TAG1 + TAG2 + …';
comment on column public.cases.consultant is
  'JSON object: {"firstname":"…","lastname":"…","gmc":"…"}';

comment on column public.cases.hospital is
  'Optional UK hospital / trust site name from the app list; empty string if unset.';
comment on column public.cases.cepod is
  'Optional cepod category; null if unset.';

create index if not exists cases_user_id_idx on public.cases (user_id);
create index if not exists cases_user_case_date_idx on public.cases (user_id, case_date desc);
create index if not exists cases_cepod_idx on public.cases (user_id, cepod);
create index if not exists cases_user_hospital_idx on public.cases (user_id, hospital);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

create trigger cases_set_updated_at
before update on public.cases
for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-create public.users on auth signup
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := coalesce(meta->>'full_name', '');
  grade_raw text := nullif(trim(coalesce(meta->>'grade', '')), '');
  prefs jsonb;
begin
  prefs := jsonb_build_object(
    'title', 'Dr',
    'fullName', full_name,
    'gmcNumber', '',
    'favouriteTags', '[]'::jsonb,
    'defaultCepod', '',
    'defaultRole', '',
    'defaultHospital', '',
    'defaultSpecialty', 'General surgery'
  );

  insert into public.users (id, email, preferences, consultants, grade)
  values (new.id, new.email, prefs, '[]'::jsonb, grade_raw)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.cases enable row level security;

create policy "users_select_own" on public.users
for select using (auth.uid() = id);

create policy "users_insert_own" on public.users
for insert with check (auth.uid() = id);

create policy "users_update_own" on public.users
for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "users_delete_own" on public.users
for delete using (auth.uid() = id);

create policy "cases_select_own" on public.cases
for select using (auth.uid() = user_id);

create policy "cases_insert_own" on public.cases
for insert with check (auth.uid() = user_id);

create policy "cases_update_own" on public.cases
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cases_delete_own" on public.cases
for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.cases to authenticated;
