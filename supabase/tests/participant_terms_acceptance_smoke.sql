begin;
do $$
declare
  v_profile uuid;
  v_accepted_at timestamptz;
begin
  v_profile := public.register_student_profile(
    null,
    'Agreement',
    'Tester',
    'Agreement.Tester@Example.com',
    'College of Engineering'
  );

  if public.has_current_participant_terms_acceptance(v_profile) then
    raise exception 'A new participant must not begin with accepted terms';
  end if;

  v_accepted_at := public.accept_current_participant_terms(v_profile, 'smoke-test-agent');
  if v_accepted_at is null or not public.has_current_participant_terms_acceptance(v_profile) then
    raise exception 'Participant terms acceptance was not recorded';
  end if;

  if not exists (
    select 1 from public.participant_terms_acceptances
    where student_profile_id = v_profile
      and normalized_email = 'agreement.tester@example.com'
      and terms_version = '2026-11-23-v1'
      and terms_snapshot <> ''
      and user_agent = 'smoke-test-agent'
  ) then
    raise exception 'Participant terms proof is incomplete';
  end if;

  update public.student_profiles
  set email = 'agreement.changed@example.com'
  where id = v_profile;

  if public.has_current_participant_terms_acceptance(v_profile) then
    raise exception 'Changing the participant email must require renewed acceptance';
  end if;
end;
$$;
rollback;
