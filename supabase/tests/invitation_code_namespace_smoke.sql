begin;
do $$
declare
  v_admin uuid;
  v_competition uuid;
  v_team uuid;
  v_competition_collision_blocked boolean := false;
  v_team_collision_blocked boolean := false;
begin
  select user_id into v_admin from public.admin_users limit 1;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into public.competitions(
    name,
    competition_code,
    description,
    competition_type,
    status,
    start_at,
    end_at,
    environment
  ) values(
    'Invitation code namespace smoke test',
    'C0DE01',
    'Rollback-only',
    'group',
    'active',
    now() - interval '1 hour',
    now() + interval '1 day',
    'development'
  ) returning id into v_competition;

  insert into public.teams(competition_id, name, team_code)
  values(v_competition, 'Invitation Code Smoke Team', 'TEAM01')
  returning id into v_team;

  begin
    insert into public.teams(competition_id, name, team_code)
    values(v_competition, 'Conflicting Team', 'c0de01');
  exception when unique_violation then
    v_team_collision_blocked := true;
  end;

  begin
    insert into public.competitions(
      name,
      competition_code,
      description,
      competition_type,
      status,
      start_at,
      end_at,
      environment
    ) values(
      'Conflicting competition',
      'team01',
      'Rollback-only',
      'individual',
      'active',
      now() - interval '1 hour',
      now() + interval '1 day',
      'development'
    );
  exception when unique_violation then
    v_competition_collision_blocked := true;
  end;

  if not v_team_collision_blocked or not v_competition_collision_blocked then
    raise exception 'Competition and team codes did not share one protected namespace';
  end if;

  if (select team_id from public.find_competition_by_code('C0DE01')) is not null then
    raise exception 'Competition code unexpectedly resolved to a team';
  end if;
  if (select team_id from public.find_competition_by_code('TEAM01')) is distinct from v_team then
    raise exception 'Team code did not resolve to its team';
  end if;
end;
$$;
rollback;
