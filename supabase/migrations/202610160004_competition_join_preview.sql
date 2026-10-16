-- DESIGN DECISION: Students see useful, non-sensitive competition context before enrolling.
-- Participant and activity totals are aggregate counts; individual identities and completions stay private.
create or replace function public.get_competition_join_preview(p_competition_id uuid)
returns table(
  competition_id uuid,
  name text,
  description text,
  competition_type text,
  start_at timestamptz,
  end_at timestamptz,
  participant_count bigint,
  activity_count bigint
)
language sql stable security definer set search_path = public as $$
  select c.id,c.name,c.description,c.competition_type,c.start_at,c.end_at,
    count(distinct p.id),count(distinct ea.activity_id)
  from public.competitions c
  left join public.participants p on p.competition_id=c.id
  left join public.event_activities ea on ea.competition_id=c.id
  where c.id=p_competition_id and c.end_at>now()
  group by c.id;
$$;

revoke all on function public.get_competition_join_preview(uuid) from public;
grant execute on function public.get_competition_join_preview(uuid) to anon,authenticated;
