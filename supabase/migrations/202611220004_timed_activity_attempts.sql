-- Timed activities must run for their configured duration before points can be awarded.
-- A tab-specific token lets the browser resume after refresh while server timestamps
-- prevent background throttling or client clock changes from shortening the activity.
create table if not exists public.timed_activity_attempts (
  id uuid primary key default gen_random_uuid(),
  attempt_token uuid not null unique default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  started_at timestamptz not null,
  ready_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  constraint timed_activity_attempts_ready_after_start check (ready_at > started_at)
);

create unique index if not exists timed_activity_attempts_one_active_per_participant
  on public.timed_activity_attempts (participant_id)
  where status = 'active';

alter table public.timed_activity_attempts enable row level security;
drop policy if exists "Admins manage timed activity attempts" on public.timed_activity_attempts;
create policy "Admins manage timed activity attempts"
  on public.timed_activity_attempts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.timed_activity_attempts to authenticated;

create or replace function public.start_timed_activity(
  p_profile_id uuid,
  p_competition_id uuid,
  p_activity_id uuid
)
returns table(attempt_token uuid, started_at timestamptz, ready_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant uuid;
  v_duration integer;
  v_type text;
  v_started_at timestamptz := clock_timestamp();
  v_token uuid;
  v_ready_at timestamptz;
begin
  select p.id, c.competition_type
    into v_participant, v_type
  from public.participants p
  join public.competitions c on c.id = p.competition_id
  where p.student_profile_id = p_profile_id
    and p.competition_id = p_competition_id
    and c.start_at <= v_started_at
    and c.end_at > v_started_at;

  if v_participant is null then
    raise exception 'This competition is not currently active';
  end if;
  if v_type = 'group' and not exists (
    select 1 from public.team_memberships where participant_id = v_participant
  ) then
    raise exception 'Wait for the organizer to assign you to a team';
  end if;

  select a.duration_minutes
    into v_duration
  from public.activities a
  join public.event_activities ea on ea.activity_id = a.id
  where ea.competition_id = p_competition_id
    and a.id = p_activity_id
    and a.is_active = true
    and a.completion_type = 'timed';

  if v_duration is null then
    raise exception 'This timed activity is not available in the competition';
  end if;
  if exists (
    select 1 from public.activity_completions ac
    where ac.competition_id = p_competition_id
      and ac.participant_id = v_participant
      and ac.activity_id = p_activity_id
  ) then
    raise exception 'This activity is already completed';
  end if;

  update public.timed_activity_attempts
  set status = 'cancelled'
  where participant_id = v_participant and status = 'active';

  v_ready_at := v_started_at + make_interval(mins => v_duration);
  insert into public.timed_activity_attempts(
    participant_id,
    competition_id,
    activity_id,
    started_at,
    ready_at
  ) values(
    v_participant,
    p_competition_id,
    p_activity_id,
    v_started_at,
    v_ready_at
  )
  returning timed_activity_attempts.attempt_token into v_token;

  return query select v_token, v_started_at, v_ready_at;
end;
$$;

create or replace function public.get_timed_activity_attempt(
  p_profile_id uuid,
  p_competition_id uuid,
  p_activity_id uuid,
  p_attempt_token uuid
)
returns table(attempt_token uuid, started_at timestamptz, ready_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select ta.attempt_token, ta.started_at, ta.ready_at
  from public.timed_activity_attempts ta
  join public.participants p on p.id = ta.participant_id
  where p.student_profile_id = p_profile_id
    and ta.competition_id = p_competition_id
    and ta.activity_id = p_activity_id
    and ta.attempt_token = p_attempt_token
    and ta.status = 'active';
$$;

create or replace function public.cancel_timed_activity(
  p_profile_id uuid,
  p_attempt_token uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.timed_activity_attempts ta
  set status = 'cancelled'
  from public.participants p
  where p.id = ta.participant_id
    and p.student_profile_id = p_profile_id
    and ta.attempt_token = p_attempt_token
    and ta.status = 'active';
$$;

create or replace function public.complete_timed_activity_with_progress(
  p_profile_id uuid,
  p_competition_id uuid,
  p_activity_id uuid,
  p_attempt_token uuid
)
returns table(participant_points integer, completed_count bigint, activity_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.timed_activity_attempts%rowtype;
  v_participant uuid;
  v_points integer;
  v_type text;
begin
  select ta.* into v_attempt
  from public.timed_activity_attempts ta
  join public.participants p on p.id = ta.participant_id
  where p.student_profile_id = p_profile_id
    and ta.competition_id = p_competition_id
    and ta.activity_id = p_activity_id
    and ta.attempt_token = p_attempt_token
    and ta.status = 'active'
  for update of ta;

  if v_attempt.id is null then
    raise exception 'This timed activity session is no longer active';
  end if;
  if clock_timestamp() < v_attempt.ready_at then
    raise exception 'The activity timer is still running';
  end if;

  select p.id, c.competition_type
    into v_participant, v_type
  from public.participants p
  join public.competitions c on c.id = p.competition_id
  where p.id = v_attempt.participant_id
    and c.start_at <= clock_timestamp()
    and c.end_at > clock_timestamp();

  if v_participant is null then
    raise exception 'This competition is not currently active';
  end if;
  if v_type = 'group' and not exists (
    select 1 from public.team_memberships where participant_id = v_participant
  ) then
    raise exception 'Wait for the organizer to assign you to a team';
  end if;

  select a.points into v_points
  from public.activities a
  join public.event_activities ea on ea.activity_id = a.id
  where ea.competition_id = p_competition_id
    and a.id = p_activity_id
    and a.is_active = true
    and a.completion_type = 'timed';

  if v_points is null then
    raise exception 'Activity is not available in this competition';
  end if;

  insert into public.activity_completions(
    competition_id,
    participant_id,
    activity_id,
    points_awarded
  ) values(
    p_competition_id,
    v_participant,
    p_activity_id,
    v_points
  )
  on conflict (competition_id, participant_id, activity_id) do nothing;

  update public.participants
  set points = (
    select coalesce(sum(points_awarded), 0)::integer
    from public.activity_completions
    where participant_id = v_participant
  )
  where id = v_participant;

  update public.timed_activity_attempts
  set status = 'completed'
  where id = v_attempt.id;

  return query
  select p.points,
    (select count(distinct ac.activity_id)
     from public.activity_completions ac where ac.participant_id = v_participant),
    (select count(*)
     from (
       select ea.activity_id from public.event_activities ea
       where ea.competition_id = p_competition_id
       union
       select ac.activity_id from public.activity_completions ac
       where ac.participant_id = v_participant
     ) visible)
  from public.participants p where p.id = v_participant;
end;
$$;

-- Daily check-ins keep their immediate completion flow. Timed activities must use
-- complete_timed_activity_with_progress so the server can verify elapsed time.
create or replace function public.complete_activity_with_progress(
  p_profile_id uuid,
  p_competition_id uuid,
  p_activity_id uuid
)
returns table(participant_points integer, completed_count bigint, activity_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant uuid;
  v_points integer;
  v_type text;
  v_completion_type text;
begin
  select p.id, c.competition_type into v_participant, v_type
  from public.participants p
  join public.competitions c on c.id = p.competition_id
  where p.student_profile_id = p_profile_id
    and p.competition_id = p_competition_id
    and c.start_at <= now()
    and c.end_at > now();

  if v_participant is null then
    raise exception 'This competition is not currently active';
  end if;
  if v_type = 'group' and not exists (
    select 1 from public.team_memberships where participant_id = v_participant
  ) then
    raise exception 'Wait for the organizer to assign you to a team';
  end if;

  select a.points, a.completion_type into v_points, v_completion_type
  from public.activities a
  join public.event_activities ea on ea.activity_id = a.id
  where ea.competition_id = p_competition_id
    and a.id = p_activity_id
    and a.is_active = true;

  if v_points is null then
    raise exception 'Activity is not available in this competition';
  end if;
  if v_completion_type = 'timed' then
    raise exception 'Start and finish the activity timer before completing this activity';
  end if;

  insert into public.activity_completions(
    competition_id,
    participant_id,
    activity_id,
    points_awarded
  ) values(
    p_competition_id,
    v_participant,
    p_activity_id,
    v_points
  )
  on conflict (competition_id, participant_id, activity_id) do nothing;

  update public.participants
  set points = (
    select coalesce(sum(points_awarded), 0)::integer
    from public.activity_completions
    where participant_id = v_participant
  )
  where id = v_participant;

  return query
  select p.points,
    (select count(distinct ac.activity_id)
     from public.activity_completions ac where ac.participant_id = v_participant),
    (select count(*)
     from (
       select ea.activity_id from public.event_activities ea
       where ea.competition_id = p_competition_id
       union
       select ac.activity_id from public.activity_completions ac
       where ac.participant_id = v_participant
     ) visible)
  from public.participants p where p.id = v_participant;
end;
$$;

revoke all on function public.start_timed_activity(uuid,uuid,uuid) from public;
revoke all on function public.get_timed_activity_attempt(uuid,uuid,uuid,uuid) from public;
revoke all on function public.cancel_timed_activity(uuid,uuid) from public;
revoke all on function public.complete_timed_activity_with_progress(uuid,uuid,uuid,uuid) from public;
grant execute on function public.start_timed_activity(uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.get_timed_activity_attempt(uuid,uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.cancel_timed_activity(uuid,uuid) to anon,authenticated;
grant execute on function public.complete_timed_activity_with_progress(uuid,uuid,uuid,uuid) to anon,authenticated;
