-- DESIGN DECISION: Competitions are parent records. All operational data is isolated by competition UUID.
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 160),
  competition_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  description text not null default '',
  competition_type text not null check (competition_type in ('individual', 'group')),
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  rules text not null default '',
  disclaimer text not null default '',
  email_template text not null default '',
  environment text not null default 'production' check (environment in ('development', 'preview', 'production')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_activities (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (competition_id, activity_id)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  email text,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null,
  team_code text not null,
  created_at timestamptz not null default now(),
  unique (competition_id, team_code)
);

create table if not exists public.team_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, participant_id)
);

create table if not exists public.activity_completions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  points_awarded integer not null check (points_awarded >= 0),
  completed_at timestamptz not null default now()
);

alter table public.competitions enable row level security;
alter table public.event_activities enable row level security;
alter table public.participants enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.activity_completions enable row level security;

-- PROTOTYPE: Only approved administrators can access competition records until participant authentication is implemented.
drop policy if exists "Admins manage competitions" on public.competitions;
drop policy if exists "Admins manage event activities" on public.event_activities;
drop policy if exists "Admins manage participants" on public.participants;
drop policy if exists "Admins manage teams" on public.teams;
drop policy if exists "Admins manage memberships" on public.team_memberships;
drop policy if exists "Admins manage completions" on public.activity_completions;

create policy "Admins manage competitions" on public.competitions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage event activities" on public.event_activities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage participants" on public.participants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage memberships" on public.team_memberships for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage completions" on public.activity_completions for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.competitions, public.event_activities, public.participants, public.teams, public.team_memberships, public.activity_completions to authenticated;

create or replace function public.delete_competition(competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  delete from public.competitions where id = competition_id;
end;
$$;
revoke all on function public.delete_competition(uuid) from public, anon;
grant execute on function public.delete_competition(uuid) to authenticated;

-- Keep one realistic starting competition; all later competitions are created by the administrator UI.
insert into public.competitions (id, name, competition_code, description, competition_type, status, start_at, end_at, rules, disclaimer, email_template, environment)
values ('10000000-0000-4000-8000-000000000001', 'Fall Well-Being Challenge', 'FALL26', 'Build small habits across all seven dimensions of well-being.', 'individual', 'active', '2026-10-01 09:00:00-04', '2026-11-15 23:59:00-05', 'Complete activities honestly and safely during the competition period.', 'Participation is voluntary. Choose activities appropriate for your needs and abilities.', 'You are invited to join the Fall Well-Being Challenge.', 'production')
on conflict (id) do nothing;

insert into public.event_activities (competition_id, activity_id)
select '10000000-0000-4000-8000-000000000001', id from public.activities where is_active = true
on conflict do nothing;
