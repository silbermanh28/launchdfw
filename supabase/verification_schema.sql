alter table public.employers
  add column if not exists verification_status text not null default 'pending',
  add column if not exists email_domain_match boolean not null default false,
  add column if not exists verification_signal text not null default 'manual_review';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employers_verification_status_check'
  ) then
    alter table public.employers
      add constraint employers_verification_status_check
      check (verification_status in ('pending', 'approved', 'rejected'));
  end if;

end $$;
