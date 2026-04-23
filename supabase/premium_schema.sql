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

create table if not exists public.ai_resume_reviews (
  id bigint generated by default as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  score integer,
  summary text,
  missing_sections text[] not null default '{}'::text[],
  rewritten_bullets jsonb not null default '[]'::jsonb,
  improvement_actions text[] not null default '{}'::text[],
  review_mode text not null default 'full',
  model text,
  source_resume_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_resume_reviews_student_idx
  on public.ai_resume_reviews(student_id, created_at desc);

create table if not exists public.ai_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  job_id bigint references public.jobs(id) on delete cascade,
  application_id bigint references public.applications(id) on delete set null,
  employer_id uuid references public.employers(id) on delete set null,
  status text not null default 'active',
  questions jsonb not null default '[]'::jsonb,
  readiness_score integer,
  summary text,
  focus_areas text[] not null default '{}'::text[],
  model text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_interview_answers (
  id bigint generated by default as identity primary key,
  session_id uuid not null references public.ai_interview_sessions(id) on delete cascade,
  question_index integer not null,
  question text not null,
  answer_text text,
  audio_url text,
  score integer,
  feedback text,
  improved_answer text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ai_interview_answers_session_question_idx
  on public.ai_interview_answers(session_id, question_index);

create table if not exists public.ai_job_match_scores (
  id bigint generated by default as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  match_score integer not null default 0,
  summary text,
  strengths text[] not null default '{}'::text[],
  gaps text[] not null default '{}'::text[],
  model text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(student_id, job_id)
);

create table if not exists public.ai_applicant_rankings (
  id bigint generated by default as identity primary key,
  employer_id uuid not null references public.employers(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  application_id bigint not null references public.applications(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  match_score integer not null default 0,
  rank_position integer,
  summary_reason text,
  strengths text[] not null default '{}'::text[],
  concerns text[] not null default '{}'::text[],
  model text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(job_id, application_id)
);

create index if not exists ai_applicant_rankings_job_idx
  on public.ai_applicant_rankings(job_id, match_score desc);

create table if not exists public.job_analytics_daily (
  id bigint generated by default as identity primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  employer_id uuid not null references public.employers(id) on delete cascade,
  metric_date date not null,
  total_views integer not null default 0,
  total_applications integer not null default 0,
  average_applicant_match_score numeric(5,2),
  applicant_schools jsonb not null default '{}'::jsonb,
  applications_by_weekday jsonb not null default '{}'::jsonb,
  similar_role_average_views numeric(10,2),
  similar_role_average_applications numeric(10,2),
  conversion_rate numeric(6,2),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(job_id, metric_date)
);

create table if not exists public.ai_request_logs (
  id bigint generated by default as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  feature_key text not null,
  status text not null default 'success',
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

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

drop trigger if exists set_ai_resume_reviews_updated_at on public.ai_resume_reviews;
create trigger set_ai_resume_reviews_updated_at
before update on public.ai_resume_reviews
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_ai_interview_sessions_updated_at on public.ai_interview_sessions;
create trigger set_ai_interview_sessions_updated_at
before update on public.ai_interview_sessions
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_ai_job_match_scores_updated_at on public.ai_job_match_scores;
create trigger set_ai_job_match_scores_updated_at
before update on public.ai_job_match_scores
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_ai_applicant_rankings_updated_at on public.ai_applicant_rankings;
create trigger set_ai_applicant_rankings_updated_at
before update on public.ai_applicant_rankings
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_job_analytics_daily_updated_at on public.job_analytics_daily;
create trigger set_job_analytics_daily_updated_at
before update on public.job_analytics_daily
for each row
execute function public.set_updated_at_timestamp();

alter table public.subscriptions enable row level security;
alter table public.ai_resume_reviews enable row level security;
alter table public.ai_interview_sessions enable row level security;
alter table public.ai_interview_answers enable row level security;
alter table public.ai_job_match_scores enable row level security;
alter table public.ai_applicant_rankings enable row level security;
alter table public.job_analytics_daily enable row level security;
alter table public.ai_request_logs enable row level security;

drop policy if exists "profiles can read own subscription rows" on public.subscriptions;
create policy "profiles can read own subscription rows"
  on public.subscriptions
  for select
  using (auth.uid() = profile_id);

drop policy if exists "students can read own resume reviews" on public.ai_resume_reviews;
create policy "students can read own resume reviews"
  on public.ai_resume_reviews
  for select
  using (auth.uid() = student_id);

drop policy if exists "students can read own interview sessions" on public.ai_interview_sessions;
create policy "students can read own interview sessions"
  on public.ai_interview_sessions
  for select
  using (auth.uid() = student_id);

drop policy if exists "students can read own interview answers" on public.ai_interview_answers;
create policy "students can read own interview answers"
  on public.ai_interview_answers
  for select
  using (
    exists (
      select 1
      from public.ai_interview_sessions s
      where s.id = ai_interview_answers.session_id
        and s.student_id = auth.uid()
    )
  );

drop policy if exists "students can read own job matches" on public.ai_job_match_scores;
create policy "students can read own job matches"
  on public.ai_job_match_scores
  for select
  using (auth.uid() = student_id);

drop policy if exists "employers can read own applicant rankings" on public.ai_applicant_rankings;
create policy "employers can read own applicant rankings"
  on public.ai_applicant_rankings
  for select
  using (auth.uid() = employer_id);

drop policy if exists "employers can read own analytics" on public.job_analytics_daily;
create policy "employers can read own analytics"
  on public.job_analytics_daily
  for select
  using (auth.uid() = employer_id);
