begin;
do $$
declare
  v_admin uuid;
  v_competition uuid;
  v_profile uuid;
  v_participant uuid;
  v_timed_activity uuid;
  v_daily_activity uuid;
  v_token uuid;
  v_bypass_blocked boolean := false;
  v_early_finish_blocked boolean := false;
  v_points integer;
begin
  select user_id into v_admin from public.admin_users limit 1;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into public.competitions(
    name,
    description,
    competition_type,
    status,
    start_at,
    end_at,
    environment
  ) values(
    'Timed activity smoke test',
    'Rollback-only',
    'individual',
    'active',
    now() - interval '1 hour',
    now() + interval '1 day',
    'development'
  ) returning id into v_competition;

  insert into public.activities(
    title,
    description,
    dimension,
    completion_type,
    duration_minutes,
    points
  ) values(
    'Timed activity smoke test walk',
    'Rollback-only',
    'Physical',
    'timed',
    10,
    50
  ) returning id into v_timed_activity;

  insert into public.activities(
    title,
    description,
    dimension,
    completion_type,
    duration_minutes,
    points
  ) values(
    'Timed activity smoke test check-in',
    'Rollback-only',
    'Emotional',
    'daily_check_in',
    null,
    30
  ) returning id into v_daily_activity;

  insert into public.event_activities(competition_id, activity_id)
  values(v_competition, v_timed_activity), (v_competition, v_daily_activity);

  v_profile := public.register_student_profile(
    null,
    'Timer',
    'Tester',
    'timer-smoke@example.com',
    'College of Engineering'
  );
  insert into public.participants(
    competition_id,
    student_profile_id,
    display_name,
    email
  ) values(
    v_competition,
    v_profile,
    'Timer Tester',
    'timer-smoke@example.com'
  ) returning id into v_participant;

  begin
    perform public.complete_activity_with_progress(
      v_profile,
      v_competition,
      v_timed_activity
    );
  exception when others then
    v_bypass_blocked := sqlerrm like 'Start and finish the activity timer%';
  end;

  select attempt_token into v_token
  from public.start_timed_activity(v_profile, v_competition, v_timed_activity);

  begin
    perform public.complete_timed_activity_with_progress(
      v_profile,
      v_competition,
      v_timed_activity,
      v_token
    );
  exception when others then
    v_early_finish_blocked := sqlerrm = 'The activity timer is still running';
  end;

  if not v_bypass_blocked or not v_early_finish_blocked then
    raise exception 'Timed activity completion was not protected';
  end if;

  update public.timed_activity_attempts
  set started_at = now() - interval '20 minutes',
      ready_at = now() - interval '10 minutes'
  where attempt_token = v_token;

  perform public.complete_timed_activity_with_progress(
    v_profile,
    v_competition,
    v_timed_activity,
    v_token
  );
  perform public.complete_activity_with_progress(
    v_profile,
    v_competition,
    v_daily_activity
  );

  select points into v_points from public.participants where id = v_participant;
  if v_points <> 80 then
    raise exception 'Expected 80 points after timed and daily activities, got %', v_points;
  end if;
end;
$$;
rollback;
