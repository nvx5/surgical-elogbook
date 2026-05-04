-- Add specialty column to cases (plain text; app UI uses a fixed dropdown list).

alter table public.cases add column if not exists specialty text;

update public.cases set specialty = 'General surgery' where specialty is null or trim(specialty) = '';

alter table public.cases alter column specialty set not null;

comment on column public.cases.specialty is 'Surgical specialty label (plain text). Preset options are enforced in the app only.';

notify pgrst, 'reload schema';
