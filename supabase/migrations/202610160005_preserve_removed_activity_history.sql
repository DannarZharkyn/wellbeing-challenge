-- DESIGN DECISION: Removing an activity from a competition prevents new completions but must not
-- erase work a student already completed. Completion rows remain the historical source of truth.
create or replace function public.list_enrolled_activities(p_profile_id uuid,p_competition_id uuid)
returns table(id uuid,title text,description text,dimension text,completion_type text,duration_minutes integer,points integer,completed boolean)
language sql stable security definer set search_path = public as $$
  select a.id,a.title,a.description,a.dimension,a.completion_type,a.duration_minutes,a.points,
    exists(select 1 from public.activity_completions ac where ac.participant_id=p.id and ac.activity_id=a.id)
  from public.participants p
  join public.activities a on (
    exists(select 1 from public.event_activities ea where ea.competition_id=p.competition_id and ea.activity_id=a.id)
    or exists(select 1 from public.activity_completions ac where ac.participant_id=p.id and ac.activity_id=a.id)
  )
  where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id
    and (a.is_active=true or exists(select 1 from public.activity_completions ac where ac.participant_id=p.id and ac.activity_id=a.id))
  order by a.dimension,a.title;
$$;
