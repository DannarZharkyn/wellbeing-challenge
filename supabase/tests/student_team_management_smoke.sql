begin;
do $$
declare
  v_admin uuid;
  v_competition uuid;
  v_profile_one uuid;
  v_profile_two uuid;
  v_participant_two uuid;
  v_team uuid;
  v_code text;
  v_count integer;
begin
  select user_id into v_admin from public.admin_users limit 1;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  insert into public.competitions(name,description,competition_type,status,start_at,end_at,environment)
  values('Student team smoke test','Rollback-only','group','active',now()-interval '1 hour',now()+interval '1 day','development')
  returning id into v_competition;
  v_profile_one:=public.register_student_profile(null,'Team','Creator','team-creator-smoke@example.com','College of Engineering');
  v_profile_two:=public.register_student_profile(null,'Team','Member','team-member-smoke@example.com','College of Engineering');
  insert into public.participants(competition_id,student_profile_id,display_name,email)
  values(v_competition,v_profile_one,'Team Creator','team-creator-smoke@example.com'),
        (v_competition,v_profile_two,'Team Member','team-member-smoke@example.com');

  select created.team_id,created.team_code into v_team,v_code
  from public.create_student_team(v_profile_one,v_competition,'Unique Smoke Team') created;
  perform public.join_student_team(v_profile_two,v_competition,v_code);
  select count(*) into v_count from public.get_student_team_details(v_profile_one,v_competition);
  if v_count<>2 then raise exception 'Expected two team members, got %',v_count; end if;
  select p.id into v_participant_two from public.participants p
  where p.competition_id=v_competition and p.student_profile_id=v_profile_two;
  perform public.remove_student_team_member(v_profile_one,v_competition,v_participant_two);
  if exists(select 1 from public.team_memberships where team_id=v_team and participant_id=v_participant_two)
    then raise exception 'Removed member remained assigned'; end if;
end;
$$;
rollback;
