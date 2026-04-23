alter table public.jobs
  add column if not exists application_deadline timestamptz;

create index if not exists jobs_application_deadline_idx
  on public.jobs(application_deadline);
