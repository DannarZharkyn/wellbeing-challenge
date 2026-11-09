begin;

do $$
declare
  v_admin uuid;
  v_competition uuid;
  v_profile uuid;
  v_mismatch_profile uuid;
  v_activity_ids uuid[];
  v_count bigint;
begin
  select user_id into v_admin from public.admin_users limit 1;
  if v_admin is null then raise exception 'Smoke test requires an administrator'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into public.competitions (
    name, description, competition_type, status, start_at, end_at, environment
  ) values (
    'Defined participant smoke test', 'Rollback-only test', 'group', 'scheduled',
    now() + interval '1 day', now() + interval '8 days', 'development'
  ) returning id into v_competition;

  select public.import_competition_participants(
    v_competition,
    '[{"first_name":"Exact","last_name":"Student","email":"defined-exact-smoke@example.com"},
      {"first_name":"Waiting","last_name":"Student","email":"defined-waiting-smoke@example.com"},
      {"first_name":"Roster","last_name":"Identity","email":"defined-mismatch-smoke@example.com"}]'::jsonb
  ) into v_count;
  if v_count <> 3 then raise exception 'Expected 3 imported participants, got %', v_count; end if;

  select public.register_student_profile(
    null, 'Exact', 'Student', 'defined-exact-smoke@example.com', 'College of Engineering'
  ) into v_profile;
  if not exists (
    select 1 from public.participants
    where competition_id = v_competition and student_profile_id = v_profile
  ) then raise exception 'Exact student identity was not linked to the imported participant'; end if;

  if exists (
    select 1 from public.participants
    where competition_id = v_competition
      and email = 'defined-waiting-smoke@example.com'
      and student_profile_id is not null
  ) then raise exception 'Unregistered imported participant should remain unassigned'; end if;

  select public.register_student_profile(
    null, 'Different', 'Identity', 'defined-mismatch-smoke@example.com', 'College of Engineering'
  ) into v_mismatch_profile;
  if exists (
    select 1 from public.participants
    where competition_id = v_competition
      and email = 'defined-mismatch-smoke@example.com'
      and student_profile_id = v_mismatch_profile
  ) then raise exception 'A mismatched roster name must not claim a preloaded participant row'; end if;

  select array_agg(id order by id) into v_activity_ids
  from (select id from public.activities where is_active = true limit 2) selected;
  if coalesce(array_length(v_activity_ids, 1), 0) <> 2 then raise exception 'Smoke test requires 2 active activities'; end if;

  select public.assign_competition_activities_v2(
    v_competition,
    'combined',
    v_activity_ids,
    '[{"title":"Defined participant smoke activity","dimension":"Social"}]'::jsonb
  ) into v_count;
  if v_count <> 3 then raise exception 'Expected 3 assigned activities, got %', v_count; end if;
end;
$$;

rollback;
