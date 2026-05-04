-- Run once if you already have handle_new_user() without signup metadata support.
-- Copies auth.users.raw_user_meta_data (from signUp options.data) into public.users.

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
