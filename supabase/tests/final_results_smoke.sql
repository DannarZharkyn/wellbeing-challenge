-- Rollback-only production smoke test for both final-result modes.
begin;
do $$
declare
  individual_competition uuid;
  group_competition uuid;
  profile_winner uuid;
  profile_runner_up uuid;
  participant_winner uuid;
  participant_runner_up uuid;
  team_winner uuid;
  team_runner_up uuid;
  result record;
begin
  insert into public.competitions(name,description,competition_type,status,start_at,end_at)
  values('Final result smoke individual','Rollback-only test','individual','ended',now()-interval '2 days',now()-interval '1 day')
  returning id into individual_competition;

  insert into public.student_profiles(first_name,last_name,email,college)
  values('Winner','One','smoke-winner-'||gen_random_uuid()||'@example.test','Test College') returning id into profile_winner;
  insert into public.student_profiles(first_name,last_name,email,college)
  values('Runner','Up','smoke-runner-'||gen_random_uuid()||'@example.test','Test College') returning id into profile_runner_up;

  insert into public.participants(competition_id,student_profile_id,display_name,email,points)
  values(individual_competition,profile_winner,'Winner One','winner@example.test',100) returning id into participant_winner;
  insert into public.participants(competition_id,student_profile_id,display_name,email,points)
  values(individual_competition,profile_runner_up,'Runner Up','runner@example.test',50) returning id into participant_runner_up;

  select * into result from public.get_final_competition_result(profile_runner_up,individual_competition);
  if result.winner_name<>'Winner One' or result.winner_points<>100 or result.current_rank<>2 or result.current_points<>50 then
    raise exception 'Individual final-result assertion failed';
  end if;

  insert into public.competitions(name,description,competition_type,status,start_at,end_at)
  values('Final result smoke group','Rollback-only test','group','ended',now()-interval '2 days',now()-interval '1 day')
  returning id into group_competition;
  insert into public.teams(competition_id,name,team_code) values(group_competition,'Winning Team','SMOKE1') returning id into team_winner;
  insert into public.teams(competition_id,name,team_code) values(group_competition,'Runner Team','SMOKE2') returning id into team_runner_up;
  update public.participants set competition_id=group_competition where id in(participant_winner,participant_runner_up);
  insert into public.team_memberships(team_id,participant_id) values(team_winner,participant_winner),(team_runner_up,participant_runner_up);

  select * into result from public.get_final_competition_result(profile_runner_up,group_competition);
  if result.winner_name<>'Winning Team' or result.winner_points<>100 or result.current_rank<>2 or result.current_points<>50 then
    raise exception 'Team final-result assertion failed';
  end if;
end;
$$;
rollback;
