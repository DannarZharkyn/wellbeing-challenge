-- DESIGN DECISION: Every competition owns one globally unique competition code. Group competitions
-- may additionally own team codes, while individual competitions can never have teams.
create unique index if not exists teams_normalized_team_code_key
  on public.teams (upper(trim(team_code)));

create or replace function public.enforce_group_team()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.competitions
    where id = new.competition_id and competition_type = 'group'
  ) then
    raise exception 'Teams can only belong to group competitions';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_require_group_competition on public.teams;
create trigger teams_require_group_competition
before insert or update of competition_id on public.teams
for each row execute function public.enforce_group_team();

-- PROTOTYPE: Anonymous students may look up an active competition using its invitation code.
-- TODO(PRODUCTION): Bind enrollment to auth.uid(), add rate limiting, and audit code lookups.
create or replace function public.find_competition_by_code(p_code text)
returns table(
  competition_id uuid,
  competition_name text,
  competition_type text,
  team_id uuid,
  team_name text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.competition_type, t.id, t.name
  from public.competitions c
  left join public.teams t
    on t.competition_id = c.id
   and upper(trim(t.team_code)) = upper(trim(p_code))
  where c.status in ('scheduled', 'active')
    and c.end_at > now()
    and (
      upper(trim(c.competition_code)) = upper(trim(p_code))
      or (c.competition_type = 'group' and t.id is not null)
    )
  order by (t.id is not null) desc
  limit 1;
$$;

create or replace function public.join_competition_by_code(p_profile_id uuid, p_code text)
returns table(
  participant_id uuid,
  competition_id uuid,
  competition_name text,
  competition_type text,
  team_name text
)
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.student_profiles%rowtype;
  v_competition uuid;
  v_name text;
  v_type text;
  v_team uuid;
  v_team_name text;
  v_participant uuid;
begin
  select * into v_profile from public.student_profiles where id = p_profile_id;
  if v_profile.id is null then raise exception 'Student profile not found'; end if;

  select f.competition_id, f.competition_name, f.competition_type, f.team_id, f.team_name
    into v_competition, v_name, v_type, v_team, v_team_name
  from public.find_competition_by_code(p_code) f;
  if v_competition is null then raise exception 'Invitation code is not valid'; end if;

  insert into public.participants(competition_id, student_profile_id, display_name, email)
  values(v_competition, v_profile.id, v_profile.first_name || ' ' || v_profile.last_name, v_profile.email)
  on conflict (competition_id, student_profile_id) where student_profile_id is not null
  do update set display_name = excluded.display_name, email = excluded.email
  returning id into v_participant;

  if v_type = 'group' and v_team is not null then
    delete from public.team_memberships tm
    using public.teams existing_team
    where tm.team_id = existing_team.id
      and tm.participant_id = v_participant
      and existing_team.competition_id = v_competition;
    insert into public.team_memberships(team_id, participant_id)
    values(v_team, v_participant)
    on conflict do nothing;
  end if;

  return query select v_participant, v_competition, v_name, v_type, v_team_name;
end;
$$;

revoke all on function public.find_competition_by_code(text), public.join_competition_by_code(uuid,text) from public;
grant execute on function public.find_competition_by_code(text), public.join_competition_by_code(uuid,text) to anon, authenticated;
