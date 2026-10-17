-- DESIGN DECISION: Progress counts every activity still assigned plus completed historical activities,
-- so removing an activity never makes a student's completed work or points disappear.
create or replace function public.list_student_enrollments(p_profile_id uuid)
returns table(participant_id uuid,competition_id uuid,name text,description text,competition_type text,status text,start_at timestamptz,end_at timestamptz,competition_code text,team_name text,points integer,activity_count bigint,completed_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id,c.id,c.name,c.description,c.competition_type,c.status,c.start_at,c.end_at,c.competition_code,
    (select max(t.name) from public.team_memberships tm join public.teams t on t.id=tm.team_id where tm.participant_id=p.id),
    p.points,
    (select count(*) from (
      select ea.activity_id from public.event_activities ea where ea.competition_id=c.id
      union
      select ac.activity_id from public.activity_completions ac where ac.participant_id=p.id
    ) visible_activities),
    (select count(distinct ac.activity_id) from public.activity_completions ac where ac.participant_id=p.id)
  from public.participants p join public.competitions c on c.id=p.competition_id
  where p.student_profile_id=p_profile_id
  order by c.start_at;
$$;

-- PROTOTYPE: The profile UUID is the browser's temporary identity. The function verifies enrollment
-- before returning the competition leaderboard, but production must use an authenticated BU user.
create or replace function public.get_individual_competition_leaderboard(p_profile_id uuid,p_competition_id uuid)
returns table(rank bigint,participant_id uuid,display_name text,points integer,completed_count bigint,is_current_student boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(
    select 1 from public.participants p join public.competitions c on c.id=p.competition_id
    where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id and c.competition_type='individual'
  ) then raise exception 'Join this individual competition to view its leaderboard'; end if;
  return query
  select dense_rank() over(order by p.points desc,count(distinct ac.activity_id) desc,p.created_at),
    p.id,p.display_name,p.points,count(distinct ac.activity_id),p.student_profile_id=p_profile_id
  from public.participants p left join public.activity_completions ac on ac.participant_id=p.id
  where p.competition_id=p_competition_id
  group by p.id
  order by p.points desc,count(distinct ac.activity_id) desc,p.created_at;
end; $$;

create or replace function public.get_team_competition_leaderboard(p_profile_id uuid,p_competition_id uuid)
returns table(rank bigint,team_id uuid,team_name text,points bigint,completed_count bigint,member_count bigint,is_current_team boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(
    select 1 from public.participants p join public.competitions c on c.id=p.competition_id
    where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id and c.competition_type='group'
  ) then raise exception 'Join this team competition to view its leaderboard'; end if;
  return query
  with participant_totals as (
    select tm.team_id,p.id,p.points,p.student_profile_id,count(ac.id)::bigint as completions
    from public.team_memberships tm join public.participants p on p.id=tm.participant_id
    left join public.activity_completions ac on ac.participant_id=p.id
    group by tm.team_id,p.id
  )
  select dense_rank() over(order by coalesce(sum(pt.points),0) desc,coalesce(sum(pt.completions),0) desc,t.created_at),
    t.id,t.name,coalesce(sum(pt.points),0),coalesce(sum(pt.completions),0),count(pt.id),
    coalesce(bool_or(pt.student_profile_id=p_profile_id),false)
  from public.teams t left join participant_totals pt on pt.team_id=t.id
  where t.competition_id=p_competition_id
  group by t.id
  order by coalesce(sum(pt.points),0) desc,coalesce(sum(pt.completions),0) desc,t.created_at;
end; $$;

revoke all on function public.get_individual_competition_leaderboard(uuid,uuid),public.get_team_competition_leaderboard(uuid,uuid) from public;
grant execute on function public.get_individual_competition_leaderboard(uuid,uuid),public.get_team_competition_leaderboard(uuid,uuid) to anon,authenticated;

-- TODO(PRODUCTION): Replace p_profile_id with auth.uid(), add pagination, and define privacy rules for leaderboard names.
