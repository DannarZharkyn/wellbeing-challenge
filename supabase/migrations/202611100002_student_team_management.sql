-- DESIGN DECISION: A competition code enrolls a student in the group competition;
-- every team has a separate globally unique team code used only for team membership.
create unique index if not exists teams_competition_normalized_name_key
  on public.teams (competition_id, lower(trim(name)));

-- PROTOTYPE: The local student profile UUID authorizes these actions. Production must
-- replace it with auth.uid(), audit membership changes, and define team-owner permissions.
create or replace function public.create_student_team(
  p_profile_id uuid,
  p_competition_id uuid,
  p_team_name text
)
returns table(team_id uuid, team_name text, team_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant uuid;
  v_team uuid;
  v_code text;
  v_name text := trim(p_team_name);
begin
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Team name must be between 2 and 80 characters';
  end if;
  if not exists (
    select 1 from public.competitions c
    where c.id = p_competition_id
      and c.competition_type = 'group'
      and c.status in ('scheduled','active')
      and c.end_at > now()
  ) then raise exception 'This group competition is not available'; end if;

  select p.id into v_participant
  from public.participants p
  where p.competition_id = p_competition_id and p.student_profile_id = p_profile_id;
  if v_participant is null then raise exception 'Join the competition before creating a team'; end if;
  if exists (
    select 1 from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.participant_id = v_participant and t.competition_id = p_competition_id
  ) then raise exception 'You are already assigned to a team'; end if;
  if exists (
    select 1 from public.teams t
    where t.competition_id = p_competition_id and lower(trim(t.name)) = lower(v_name)
  ) then raise exception 'That team name is already being used'; end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.teams existing_team where upper(trim(existing_team.team_code)) = v_code);
  end loop;

  insert into public.teams(competition_id,name,team_code)
  values(p_competition_id,v_name,v_code)
  returning id into v_team;
  insert into public.team_memberships(team_id,participant_id) values(v_team,v_participant);

  return query select v_team,v_name,v_code;
exception
  when unique_violation then
    raise exception 'That team name is already being used';
end;
$$;

create or replace function public.join_student_team(
  p_profile_id uuid,
  p_competition_id uuid,
  p_team_code text
)
returns table(team_id uuid, team_name text, team_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant uuid;
  v_team public.teams%rowtype;
begin
  select p.id into v_participant
  from public.participants p
  where p.competition_id = p_competition_id and p.student_profile_id = p_profile_id;
  if v_participant is null then raise exception 'Join the competition before joining a team'; end if;
  if exists (
    select 1 from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.participant_id=v_participant and t.competition_id=p_competition_id
  ) then raise exception 'You are already assigned to a team'; end if;

  select t.* into v_team
  from public.teams t
  join public.competitions c on c.id=t.competition_id
  where t.competition_id=p_competition_id
    and upper(trim(t.team_code))=upper(trim(p_team_code))
    and c.competition_type='group'
    and c.status in ('scheduled','active')
    and c.end_at>now();
  if v_team.id is null then raise exception 'That team code is not valid for this competition'; end if;

  insert into public.team_memberships(team_id,participant_id) values(v_team.id,v_participant);
  return query select v_team.id,v_team.name,v_team.team_code;
end;
$$;

create or replace function public.get_student_team_details(
  p_profile_id uuid,
  p_competition_id uuid
)
returns table(
  team_id uuid,
  team_name text,
  team_code text,
  participant_id uuid,
  display_name text,
  points integer,
  is_current_student boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with current_participant as (
    select p.id
    from public.participants p
    where p.competition_id=p_competition_id and p.student_profile_id=p_profile_id
  ), current_team as (
    select t.id,t.name,t.team_code
    from current_participant cp
    join public.team_memberships tm on tm.participant_id=cp.id
    join public.teams t on t.id=tm.team_id and t.competition_id=p_competition_id
    limit 1
  )
  select ct.id,ct.name,ct.team_code,p.id,p.display_name,p.points,(p.id=cp.id)
  from current_team ct
  join public.team_memberships tm on tm.team_id=ct.id
  join public.participants p on p.id=tm.participant_id
  cross join current_participant cp
  order by (p.id=cp.id) desc,p.display_name;
$$;

-- DESIGN DECISION: For this prototype any current member may remove another member.
-- Removing membership never deletes the participant or their points; they return to
-- the organizer's unassigned pool and may create/join another team.
create or replace function public.remove_student_team_member(
  p_profile_id uuid,
  p_competition_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid;
  v_team uuid;
begin
  select p.id into v_requester from public.participants p
  where p.competition_id=p_competition_id and p.student_profile_id=p_profile_id;
  select tm.team_id into v_team
  from public.team_memberships tm
  join public.teams t on t.id=tm.team_id
  where tm.participant_id=v_requester and t.competition_id=p_competition_id;
  if v_team is null then raise exception 'You are not assigned to a team'; end if;
  if not exists (
    select 1 from public.team_memberships
    where team_id=v_team and participant_id=p_participant_id
  ) then raise exception 'That participant is not on your team'; end if;

  delete from public.team_memberships
  where team_id=v_team and participant_id=p_participant_id;
end;
$$;

revoke all on function public.create_student_team(uuid,uuid,text) from public;
revoke all on function public.join_student_team(uuid,uuid,text) from public;
revoke all on function public.get_student_team_details(uuid,uuid) from public;
revoke all on function public.remove_student_team_member(uuid,uuid,uuid) from public;
grant execute on function public.create_student_team(uuid,uuid,text) to anon,authenticated;
grant execute on function public.join_student_team(uuid,uuid,text) to anon,authenticated;
grant execute on function public.get_student_team_details(uuid,uuid) to anon,authenticated;
grant execute on function public.remove_student_team_member(uuid,uuid,uuid) to anon,authenticated;

