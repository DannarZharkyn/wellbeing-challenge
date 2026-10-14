-- DESIGN DECISION: Activities are a reusable central library. Competitions will reference these records instead of copying activity text.
create extension if not exists pgcrypto;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  dimension text not null check (dimension in (
    'Environmental', 'Social', 'Emotional', 'Financial',
    'Intellectual', 'Spiritual', 'Physical'
  )),
  completion_type text not null check (completion_type in ('timed', 'daily_check_in')),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  points integer not null check (points between 1 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_timed_duration check (
    (completion_type = 'timed' and duration_minutes is not null)
    or (completion_type = 'daily_check_in' and duration_minutes is null)
  )
);

create unique index if not exists activities_dimension_normalized_title_key
  on public.activities (dimension, lower(regexp_replace(trim(title), '\s+', ' ', 'g')));

alter table public.activities enable row level security;

drop policy if exists "Anyone can read active activities" on public.activities;
create policy "Anyone can read active activities"
  on public.activities for select
  to anon, authenticated
  using (is_active = true);

-- PROTOTYPE: Anonymous writes let the current organizer prototype work before authentication is implemented.
-- TODO(PRODUCTION): Replace these write policies with an authenticated administrator-role check before adding Vercel environment variables.
drop policy if exists "Prototype can create activities" on public.activities;
create policy "Prototype can create activities"
  on public.activities for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Prototype can archive activities" on public.activities;
create policy "Prototype can archive activities"
  on public.activities for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.activities to anon, authenticated;

insert into public.activities (title, description, dimension, completion_type, duration_minutes, points)
values
  ('Take a mindful campus walk', 'Notice three things in nature along your route.', 'Environmental', 'timed', 10, 50),
  ('Choose a reusable bottle', 'Refill instead of reaching for a single-use bottle.', 'Environmental', 'daily_check_in', null, 30),
  ('Check in with a friend', 'Send a thoughtful message and really listen.', 'Social', 'daily_check_in', null, 40),
  ('Share a meal', 'Invite someone to eat with you without screens.', 'Social', 'timed', 30, 80),
  ('Name how you feel', 'Pause, identify the feeling, and write one sentence.', 'Emotional', 'daily_check_in', null, 35),
  ('Three good things', 'Record three moments that went well today.', 'Emotional', 'daily_check_in', null, 35),
  ('Plan a weekly budget', 'Set a realistic spending goal for the next seven days.', 'Financial', 'timed', 15, 60),
  ('Review one subscription', 'Check whether one recurring expense still serves you.', 'Financial', 'daily_check_in', null, 45),
  ('Learn something new', 'Read or watch something beyond your coursework.', 'Intellectual', 'timed', 15, 55),
  ('Visit office hours', 'Bring one question and start a conversation.', 'Intellectual', 'daily_check_in', null, 75),
  ('Quiet reflection', 'Make space to reconnect with what matters to you.', 'Spiritual', 'timed', 10, 45),
  ('Practice gratitude', 'Thank someone who made a difference this week.', 'Spiritual', 'daily_check_in', null, 35),
  ('Move for ten minutes', 'Walk, stretch, dance, or move in a way you enjoy.', 'Physical', 'timed', 10, 50),
  ('Take a hydration break', 'Refill your water and step away from your screen.', 'Physical', 'daily_check_in', null, 30)
on conflict do nothing;
