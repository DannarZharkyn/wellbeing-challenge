-- SUM(bigint) returns numeric in PostgreSQL; match the declared bigint result.
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
    t.id,t.name,coalesce(sum(pt.points),0)::bigint,coalesce(sum(pt.completions),0)::bigint,count(pt.id),
    coalesce(bool_or(pt.student_profile_id=p_profile_id),false)
  from public.teams t left join participant_totals pt on pt.team_id=t.id
  where t.competition_id=p_competition_id
  group by t.id
  order by coalesce(sum(pt.points),0) desc,coalesce(sum(pt.completions),0) desc,t.created_at;
end; $$;

