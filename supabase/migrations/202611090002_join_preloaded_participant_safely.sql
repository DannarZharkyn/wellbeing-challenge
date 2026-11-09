-- Join-by-code must respect participant rows preloaded from organizer spreadsheets.
-- An exact roster identity can be linked safely; a mismatched name must not claim
-- a reserved email or produce a low-level unique-index error.
create or replace function public.join_competition_by_code(p_profile_id uuid, p_code text)
returns table(participant_id uuid,competition_id uuid,competition_name text,competition_type text,team_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_profile public.student_profiles%rowtype;
  v_competition uuid;
  v_name text;
  v_type text;
  v_team uuid;
  v_team_name text;
  v_participant uuid;
  v_existing public.participants%rowtype;
begin
  select * into v_profile from public.student_profiles where id=p_profile_id;
  if v_profile.id is null then raise exception 'Student profile not found'; end if;

  select f.competition_id,f.competition_name,f.competition_type,f.team_id,f.team_name
    into v_competition,v_name,v_type,v_team,v_team_name
  from public.find_competition_by_code(p_code) f;
  if v_competition is null then raise exception 'Invitation code is not valid'; end if;

  select p.* into v_existing
  from public.participants p
  where p.competition_id = v_competition
    and lower(trim(p.email)) = lower(trim(v_profile.email))
  limit 1;

  if v_existing.id is not null then
    if v_existing.student_profile_id is not null
       and v_existing.student_profile_id <> v_profile.id then
      raise exception 'This email is already connected to another participant';
    end if;

    if v_existing.student_profile_id is null
       and v_existing.enrollment_source = 'spreadsheet'
       and (
         lower(trim(coalesce(v_existing.invited_first_name, ''))) <> lower(trim(v_profile.first_name))
         or lower(trim(coalesce(v_existing.invited_last_name, ''))) <> lower(trim(v_profile.last_name))
       ) then
      raise exception 'This email is on the participant list under a different name. Please contact the organizer.';
    end if;

    update public.participants
    set student_profile_id = v_profile.id,
        display_name = v_profile.first_name || ' ' || v_profile.last_name,
        email = v_profile.email
    where id = v_existing.id
    returning id into v_participant;
  else
    insert into public.participants as enrolled_participant(
      competition_id,student_profile_id,display_name,email,enrollment_source
    ) values(
      v_competition,v_profile.id,v_profile.first_name||' '||v_profile.last_name,v_profile.email,'self_enrolled'
    )
    on conflict (competition_id,student_profile_id) where student_profile_id is not null
    do update set display_name=excluded.display_name,email=excluded.email
    returning enrolled_participant.id into v_participant;
  end if;

  if v_type='group' and v_team is not null then
    delete from public.team_memberships tm using public.teams existing_team
    where tm.team_id=existing_team.id and tm.participant_id=v_participant
      and existing_team.competition_id=v_competition;
    insert into public.team_memberships(team_id,participant_id)
    values(v_team,v_participant) on conflict do nothing;
  end if;

  return query select v_participant,v_competition,v_name,v_type,v_team_name;
end;
$$;

revoke all on function public.join_competition_by_code(uuid,text) from public;
grant execute on function public.join_competition_by_code(uuid,text) to anon,authenticated;
