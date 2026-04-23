alter table public.profiles
  add column if not exists subscription_role text,
  add column if not exists premium_status text not null default 'free',
  add column if not exists premium_plan_key text,
  add column if not exists premium_expires_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_premium_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_premium_status_check
      check (premium_status in ('free', 'trialing', 'active', 'past_due', 'canceled', 'expired'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_subscription_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_role_check
      check (subscription_role in ('student', 'employer') or subscription_role is null);
  end if;
end $$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  user_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan text,
  status text,
  subscription_role text,
  premium_plan_key text,
  premium_status text not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  premium_expires_at timestamptz,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.subscriptions
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists user_id uuid,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists plan text,
  add column if not exists status text,
  add column if not exists subscription_role text,
  add column if not exists premium_plan_key text,
  add column if not exists premium_status text not null default 'free',
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists current_period_starts_at timestamptz,
  add column if not exists current_period_ends_at timestamptz,
  add column if not exists premium_expires_at timestamptz,
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  update public.subscriptions
  set profile_id = coalesce(profile_id, user_id)
  where profile_id is null and user_id is not null;

  update public.subscriptions
  set subscription_role = coalesce(
    subscription_role,
    case
      when lower(coalesce(plan, '')) like '%employer%' or lower(coalesce(plan, '')) like '%business%' then 'employer'
      else 'student'
    end
  )
  where subscription_role is null;

  update public.subscriptions
  set premium_plan_key = coalesce(
    premium_plan_key,
    nullif(plan, ''),
    case when subscription_role = 'employer' then 'employer_premium_monthly' else 'student_premium_monthly' end
  )
  where premium_plan_key is null;

  update public.subscriptions
  set premium_status = coalesce(nullif(premium_status, ''), nullif(status, ''), 'free')
  where premium_status is null or premium_status = '';

  update public.subscriptions
  set current_period_starts_at = coalesce(current_period_starts_at, current_period_start)
  where current_period_starts_at is null and current_period_start is not null;

  update public.subscriptions
  set current_period_ends_at = coalesce(current_period_ends_at, current_period_end)
  where current_period_ends_at is null and current_period_end is not null;

  update public.subscriptions
  set premium_expires_at = coalesce(premium_expires_at, current_period_ends_at, current_period_end)
  where premium_expires_at is null;
end $$;

create unique index if not exists subscriptions_profile_role_idx
  on public.subscriptions(profile_id, subscription_role)
  where profile_id is not null and subscription_role is not null;

create unique index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists subscriptions_customer_idx
  on public.subscriptions(stripe_customer_id);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at_timestamp();

alter table public.subscriptions enable row level security;

drop policy if exists "profiles can read own subscription rows" on public.subscriptions;
create policy "profiles can read own subscription rows"
  on public.subscriptions
  for select
  using (auth.uid() = profile_id);
