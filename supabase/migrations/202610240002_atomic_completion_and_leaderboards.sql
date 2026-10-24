-- DESIGN DECISION: Completing an activity returns authoritative progress in the same database call,
-- allowing the interface to update points, completion count, and percentage without a second reload.
create or replace function public.complete_activity_with_progress(
  p_profile_id uuid,
  p_competition_id uuid,
  p_activity_id uuid
)
returns table(participant_points integer, completed_count bigint, activity_count bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_participant uuid;
  v_points integer;
  v_type text;
begin
  select p.id, c.competition_type
    into v_participant, v_type
  from public.participants p
  join public.competitions c on c.id = p.competition_id
  where p.student_profile_id = p_profile_id
    and p.competition_id = p_competition_id;

  if v_participant is null then raise exception 'Join this competition before completing activities'; end if;
  if v_type = 'group' and not exists (
    select 1 from public.team_memberships where participant_id = v_participant
  ) then raise exception 'Wait for the organizer to assign you to a team'; end if;

  select a.points into v_points
  from public.activities a
  join public.event_activities ea on ea.activity_id = a.id
  where ea.competition_id = p_competition_id
    and a.id = p_activity_id
    and a.is_active = true;
  if v_points is null then raise exception 'Activity is not available in this competition'; end if;

  insert into public.activity_completions(competition_id, participant_id, activity_id, points_awarded)
  values(p_competition_id, v_participant, p_activity_id, v_points)
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
    (select count(distinct ac.activity_id) from public.activity_completions ac where ac.participant_id = v_participant),
    (select count(*) from (
      select ea.activity_id from public.event_activities ea where ea.competition_id = p_competition_id
      union
      select ac.activity_id from public.activity_completions ac where ac.participant_id = v_participant
    ) visible_activities)
  from public.participants p where p.id = v_participant;
end;
$$;

revoke all on function public.complete_activity_with_progress(uuid,uuid,uuid) from public;
grant execute on function public.complete_activity_with_progress(uuid,uuid,uuid) to anon, authenticated;

-- Qualify function arguments with positional references to avoid PL/pgSQL column-name ambiguity.
create or replace function public.get_individual_competition_leaderboard(p_profile_id uuid,p_competition_id uuid)
returns table(rank bigint,participant_id uuid,display_name text,points integer,completed_count bigint,is_current_student boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(
    select 1 from public.participants p join public.competitions c on c.id=p.competition_id
    where p.student_profile_id=$1 and p.competition_id=$2 and c.competition_type='individual'
  ) then raise exception 'Join this individual competition to view its leaderboard'; end if;
  return query
  select dense_rank() over(order by p.points desc,count(distinct ac.activity_id) desc,p.created_at)::bigint,
    p.id,p.display_name,p.points,count(distinct ac.activity_id)::bigint,(p.student_profile_id=$1)::boolean
  from public.participants p left join public.activity_completions ac on ac.participant_id=p.id
  where p.competition_id=$2
  group by p.id
  order by p.points desc,count(distinct ac.activity_id) desc,p.created_at;
end;
$$;

create or replace function public.get_team_competition_leaderboard(p_profile_id uuid,p_competition_id uuid)
returns table(rank bigint,team_id uuid,team_name text,points bigint,completed_count bigint,member_count bigint,is_current_team boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(
    select 1 from public.participants p
    join public.competitions c on c.id=p.competition_id
    join public.team_memberships tm on tm.participant_id=p.id
    where p.student_profile_id=$1 and p.competition_id=$2 and c.competition_type='group'
  ) then raise exception 'Join a team before viewing this leaderboard'; end if;
  return query
  with participant_totals as (
    select tm.team_id,p.id,p.points,p.student_profile_id,count(ac.id)::bigint as completions
    from public.team_memberships tm join public.participants p on p.id=tm.participant_id
    left join public.activity_completions ac on ac.participant_id=p.id
    group by tm.team_id,p.id
  )
  select dense_rank() over(order by coalesce(sum(pt.points),0) desc,coalesce(sum(pt.completions),0) desc,t.created_at)::bigint,
    t.id,t.name,coalesce(sum(pt.points),0)::bigint,coalesce(sum(pt.completions),0)::bigint,count(pt.id)::bigint,
    coalesce(bool_or(pt.student_profile_id=$1),false)::boolean
  from public.teams t left join participant_totals pt on pt.team_id=t.id
  where t.competition_id=$2
  group by t.id
  order by coalesce(sum(pt.points),0) desc,coalesce(sum(pt.completions),0) desc,t.created_at;
end;
$$;

revoke all on function public.get_individual_competition_leaderboard(uuid,uuid), public.get_team_competition_leaderboard(uuid,uuid) from public;
grant execute on function public.get_individual_competition_leaderboard(uuid,uuid), public.get_team_competition_leaderboard(uuid,uuid) to anon, authenticated;
