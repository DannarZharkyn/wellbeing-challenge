-- Store durable, versioned proof that a participant accepted the current terms.
-- Acceptance is bound to both the central profile and its normalized email. If the
-- email changes or the current terms version changes, the participant must accept again.
create table if not exists public.participant_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id) on delete cascade,
  normalized_email text not null,
  terms_version text not null,
  terms_snapshot text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  user_agent text,
  constraint participant_terms_acceptances_email_normalized
    check (normalized_email = lower(trim(normalized_email)))
);

create unique index if not exists participant_terms_acceptances_profile_version_key
  on public.participant_terms_acceptances(student_profile_id, terms_version);
create unique index if not exists participant_terms_acceptances_email_version_key
  on public.participant_terms_acceptances(normalized_email, terms_version);

alter table public.participant_terms_acceptances enable row level security;
drop policy if exists "Admins view participant terms acceptances"
  on public.participant_terms_acceptances;
create policy "Admins view participant terms acceptances"
  on public.participant_terms_acceptances for select to authenticated
  using (public.is_admin());
grant select on public.participant_terms_acceptances to authenticated;

create or replace function public.has_current_participant_terms_acceptance(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participant_terms_acceptances acceptance
    join public.student_profiles profile on profile.id = acceptance.student_profile_id
    where acceptance.student_profile_id = p_profile_id
      and acceptance.normalized_email = lower(trim(profile.email))
      and acceptance.terms_version = '2026-11-23-v1'
  );
$$;

create or replace function public.accept_current_participant_terms(
  p_profile_id uuid,
  p_user_agent text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_accepted_at timestamptz;
  v_terms_snapshot constant text :=
    'Wellbeing Challenge Participant Terms 2026-11-23-v1. Participation is voluntary. Activities provide general wellbeing encouragement and are not medical advice, diagnosis, or treatment. Participants must use reasonable judgment, follow activity instructions, stop activities that feel unsafe, submit completions honestly, and use only their own account. Registration, participation, team membership, completions, and points are stored to operate the challenge. Organizers may correct inaccurate results or remove participation that violates these terms.';
begin
  select lower(trim(email)) into v_email
  from public.student_profiles
  where id = p_profile_id;

  if v_email is null then
    raise exception 'Student profile not found';
  end if;

  insert into public.participant_terms_acceptances(
    student_profile_id,
    normalized_email,
    terms_version,
    terms_snapshot,
    user_agent
  ) values(
    p_profile_id,
    v_email,
    '2026-11-23-v1',
    v_terms_snapshot,
    nullif(left(trim(coalesce(p_user_agent, '')), 500), '')
  )
  on conflict (student_profile_id, terms_version)
  do update set
    normalized_email = excluded.normalized_email,
    terms_snapshot = excluded.terms_snapshot,
    accepted_at = clock_timestamp(),
    user_agent = excluded.user_agent
  returning accepted_at into v_accepted_at;

  return v_accepted_at;
end;
$$;

revoke all on function public.has_current_participant_terms_acceptance(uuid) from public;
revoke all on function public.accept_current_participant_terms(uuid,text) from public;
grant execute on function public.has_current_participant_terms_acceptance(uuid) to anon,authenticated;
grant execute on function public.accept_current_participant_terms(uuid,text) to anon,authenticated;
