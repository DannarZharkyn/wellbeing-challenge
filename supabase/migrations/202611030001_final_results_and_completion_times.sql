-- DESIGN DECISION: Final standings are snapshotted the first time an ended competition is viewed.
-- This preserves the winner, every final placement, points, and completion totals even if records
-- are later edited for administrative reasons.
create table if not exists public.competition_final_results (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  result_type text not null check (result_type in ('individual','team')),
  entity_id uuid not null,
  display_name text not null,
  final_rank integer not null check (final_rank > 0),
  points integer not null default 0,
  completed_count integer not null default 0,
  member_count integer,
  finalized_at timestamptz not null default now(),
  primary key (competition_id,result_type,entity_id)
);

alter table public.competition_final_results enable row level security;
drop policy if exists "Admins manage final results" on public.competition_final_results;
create policy "Admins manage final results" on public.competition_final_results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.competition_final_results to authenticated;

-- Completion time has always been recorded in activity_completions.completed_at. Return it to clients.
drop function if exists public.list_enrolled_activities(uuid,uuid);
create function public.list_enrolled_activities(p_profile_id uuid,p_competition_id uuid)
returns table(id uuid,title text,description text,dimension text,completion_type text,duration_minutes integer,points integer,completed boolean,completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id,a.title,a.description,a.dimension,a.completion_type,a.duration_minutes,a.points,
    (history.completed_at is not null),history.completed_at
  from public.participants p
  join public.activities a on (
    exists(select 1 from public.event_activities ea where ea.competition_id=p.competition_id and ea.activity_id=a.id)
    or exists(select 1 from public.activity_completions ac where ac.participant_id=p.id and ac.activity_id=a.id)
  )
  left join lateral (
    select ac.completed_at from public.activity_completions ac
    where ac.participant_id=p.id and ac.competition_id=p_competition_id and ac.activity_id=a.id
    order by ac.completed_at desc limit 1
  ) history on true
  where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id
    and (a.is_active=true or history.completed_at is not null)
  order by a.dimension,a.title;
$$;
revoke all on function public.list_enrolled_activities(uuid,uuid) from public;
grant execute on function public.list_enrolled_activities(uuid,uuid) to anon,authenticated;

-- Final results are generated once and then read from the snapshot on every later request.
create or replace function public.get_final_competition_result(p_profile_id uuid,p_competition_id uuid)
returns table(winner_name text,winner_points integer,current_rank integer,current_name text,current_points integer,current_completed integer)
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_participant uuid;
  v_current_entity uuid;
begin
  select c.competition_type,p.id into v_type,v_participant
  from public.competitions c
  join public.participants p on p.competition_id=c.id and p.student_profile_id=p_profile_id
  where c.id=p_competition_id and c.end_at<=now();
  if v_participant is null then raise exception 'This competition has not ended or you are not enrolled'; end if;

  if not exists(select 1 from public.competition_final_results where competition_id=p_competition_id) then
    if v_type='individual' then
      insert into public.competition_final_results(competition_id,result_type,entity_id,display_name,final_rank,points,completed_count)
      select p_competition_id,'individual',ranked.id,ranked.display_name,ranked.final_rank,ranked.points,ranked.completed_count
      from (
        select p.id,p.display_name,p.points,count(ac.id)::integer completed_count,
          row_number() over(order by p.points desc,count(ac.id) desc,p.created_at)::integer final_rank
        from public.participants p left join public.activity_completions ac on ac.participant_id=p.id
        where p.competition_id=p_competition_id group by p.id
      ) ranked on conflict do nothing;
    else
      insert into public.competition_final_results(competition_id,result_type,entity_id,display_name,final_rank,points,completed_count,member_count)
      select p_competition_id,'team',ranked.id,ranked.name,ranked.final_rank,ranked.points,ranked.completed_count,ranked.member_count
      from (
        select totals.id,totals.name,totals.points,totals.completed_count,totals.member_count,
          row_number() over(order by totals.points desc,totals.completed_count desc,totals.created_at)::integer final_rank
        from (
          select t.id,t.name,t.created_at,coalesce(sum(member.points),0)::integer points,
            coalesce(sum(member.completed_count),0)::integer completed_count,count(member.id)::integer member_count
          from public.teams t
          left join (
            select tm.team_id,p.id,p.points,count(ac.id)::integer completed_count
            from public.team_memberships tm join public.participants p on p.id=tm.participant_id
            left join public.activity_completions ac on ac.participant_id=p.id group by tm.team_id,p.id
          ) member on member.team_id=t.id
          where t.competition_id=p_competition_id group by t.id
        ) totals
      ) ranked on conflict do nothing;
    end if;
  end if;

  if v_type='individual' then v_current_entity:=v_participant;
  else select tm.team_id into v_current_entity from public.team_memberships tm where tm.participant_id=v_participant limit 1;
  end if;

  return query
  select winner.display_name,winner.points,current_result.final_rank,current_result.display_name,current_result.points,current_result.completed_count
  from public.competition_final_results winner
  left join public.competition_final_results current_result
    on current_result.competition_id=winner.competition_id and current_result.entity_id=v_current_entity
  where winner.competition_id=p_competition_id and winner.final_rank=1
  order by winner.finalized_at limit 1;
end;
$$;
revoke all on function public.get_final_competition_result(uuid,uuid) from public;
grant execute on function public.get_final_competition_result(uuid,uuid) to anon,authenticated;

-- Prevent late or early completions so the stored final standings cannot change after the deadline.
create or replace function public.complete_activity_with_progress(p_profile_id uuid,p_competition_id uuid,p_activity_id uuid)
returns table(participant_points integer, completed_count bigint, activity_count bigint)
language plpgsql security definer set search_path = public as $$
declare v_participant uuid;v_points integer;v_type text;
begin
  select p.id,c.competition_type into v_participant,v_type
  from public.participants p join public.competitions c on c.id=p.competition_id
  where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id
    and c.start_at<=now() and c.end_at>now();
  if v_participant is null then raise exception 'This competition is not currently active'; end if;
  if v_type='group' and not exists(select 1 from public.team_memberships where participant_id=v_participant)
    then raise exception 'Wait for the organizer to assign you to a team'; end if;
  select a.points into v_points from public.activities a join public.event_activities ea on ea.activity_id=a.id
  where ea.competition_id=p_competition_id and a.id=p_activity_id and a.is_active=true;
  if v_points is null then raise exception 'Activity is not available in this competition'; end if;
  insert into public.activity_completions(competition_id,participant_id,activity_id,points_awarded)
    values(p_competition_id,v_participant,p_activity_id,v_points)
    on conflict (competition_id,participant_id,activity_id) do nothing;
  update public.participants set points=(select coalesce(sum(points_awarded),0)::integer from public.activity_completions where participant_id=v_participant) where id=v_participant;
  return query select p.points,
    (select count(distinct ac.activity_id) from public.activity_completions ac where ac.participant_id=v_participant),
    (select count(*) from (select ea.activity_id from public.event_activities ea where ea.competition_id=p_competition_id union select ac.activity_id from public.activity_completions ac where ac.participant_id=v_participant) visible)
    from public.participants p where p.id=v_participant;
end;
$$;
revoke all on function public.complete_activity_with_progress(uuid,uuid,uuid) from public;
grant execute on function public.complete_activity_with_progress(uuid,uuid,uuid) to anon,authenticated;
