-- DESIGN DECISION: student_profiles is the central identity table. Email is globally
-- unique, while first and last names may be shared by many different students.
-- Spreadsheet invitations reserve an email for the exact first/last name supplied
-- by the organizer; registration must match all three values before it can link.

create or replace function public.import_competition_participants(
  p_competition_id uuid,
  p_participants jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if not exists (
    select 1 from public.competitions
    where id = p_competition_id and competition_type = 'group'
  ) then
    raise exception 'Defined participants can only be imported into a group competition';
  end if;

  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'The participant spreadsheet is empty';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_participants) as x(first_name text, last_name text, email text)
    where char_length(trim(coalesce(x.first_name, ''))) not between 1 and 80
       or char_length(trim(coalesce(x.last_name, ''))) not between 1 and 80
       or lower(trim(coalesce(x.email, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Every participant needs a valid first name, last name, and email address';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_participants) as x(first_name text, last_name text, email text)
    group by lower(trim(x.email))
    having count(*) > 1
  ) then
    raise exception 'The participant spreadsheet contains duplicate email addresses';
  end if;

  -- Reject an organizer upload that assigns an established account's email to a
  -- different name. This keeps the central identity record authoritative.
  if exists (
    select 1
    from jsonb_to_recordset(p_participants) as x(first_name text, last_name text, email text)
    join public.student_profiles sp on lower(trim(sp.email)) = lower(trim(x.email))
    where lower(trim(sp.first_name)) <> lower(trim(x.first_name))
       or lower(trim(sp.last_name)) <> lower(trim(x.last_name))
  ) then
    raise exception 'A spreadsheet email belongs to an existing student with a different name';
  end if;

  -- The same email may be invited to several competitions, but its reserved identity
  -- must remain identical everywhere.
  if exists (
    select 1
    from jsonb_to_recordset(p_participants) as x(first_name text, last_name text, email text)
    join public.participants p
      on p.enrollment_source = 'spreadsheet'
     and lower(trim(p.email)) = lower(trim(x.email))
    where lower(trim(p.invited_first_name)) <> lower(trim(x.first_name))
       or lower(trim(p.invited_last_name)) <> lower(trim(x.last_name))
  ) then
    raise exception 'A spreadsheet email is already reserved under a different name';
  end if;

  insert into public.participants (
    competition_id, student_profile_id, display_name, email,
    invited_first_name, invited_last_name, enrollment_source
  )
  select
    p_competition_id,
    sp.id,
    initcap(lower(trim(x.first_name))) || ' ' || initcap(lower(trim(x.last_name))),
    lower(trim(x.email)),
    initcap(lower(trim(x.first_name))),
    initcap(lower(trim(x.last_name))),
    'spreadsheet'
  from jsonb_to_recordset(p_participants) as x(first_name text, last_name text, email text)
  left join public.student_profiles sp on lower(trim(sp.email)) = lower(trim(x.email))
  on conflict (competition_id, lower(trim(email))) where email is not null
  do update set
    display_name = excluded.display_name,
    invited_first_name = excluded.invited_first_name,
    invited_last_name = excluded.invited_last_name,
    enrollment_source = 'spreadsheet',
    student_profile_id = coalesce(public.participants.student_profile_id, excluded.student_profile_id);

  select count(*) into v_count
  from public.participants
  where competition_id = p_competition_id and enrollment_source = 'spreadsheet';

  return v_count;
end;
$$;

create or replace function public.register_student_profile(
  p_profile_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_college text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_existing public.student_profiles%rowtype;
  v_first_name text := initcap(lower(trim(p_first_name)));
  v_last_name text := initcap(lower(trim(p_last_name)));
  v_email text := lower(trim(p_email));
begin
  if trim(p_first_name) = '' or trim(p_last_name) = ''
     or position('@' in p_email) < 2 or trim(p_college) = '' then
    raise exception 'Complete all registration fields';
  end if;

  select * into v_existing
  from public.student_profiles
  where lower(trim(email)) = v_email
  limit 1;

  if p_profile_id is null then
    if v_existing.id is not null then
      if lower(trim(v_existing.first_name)) <> lower(trim(v_first_name))
         or lower(trim(v_existing.last_name)) <> lower(trim(v_last_name)) then
        raise exception 'This email is already registered under a different name. Enter the original first and last name or contact the organizer.';
      end if;
      v_id := v_existing.id;
    else
      -- A preloaded spreadsheet invitation is also an identity reservation even
      -- before the student has created their central profile.
      if exists (
        select 1 from public.participants p
        where p.enrollment_source = 'spreadsheet'
          and lower(trim(p.email)) = v_email
          and (
            lower(trim(p.invited_first_name)) <> lower(trim(v_first_name))
            or lower(trim(p.invited_last_name)) <> lower(trim(v_last_name))
          )
      ) then
        raise exception 'This email is on an organizer participant list under a different name. Enter the invited first and last name or contact the organizer.';
      end if;

      insert into public.student_profiles(first_name, last_name, email, college)
      values(v_first_name, v_last_name, v_email, trim(p_college))
      returning id into v_id;
    end if;
  else
    select id into v_id from public.student_profiles where id = p_profile_id;
    if v_id is null then raise exception 'Student profile not found'; end if;
    if v_existing.id is not null and v_existing.id <> v_id then
      raise exception 'This email is already registered to another student';
    end if;
    if exists (
      select 1 from public.participants p
      where p.enrollment_source = 'spreadsheet'
        and lower(trim(p.email)) = v_email
        and (
          lower(trim(p.invited_first_name)) <> lower(trim(v_first_name))
          or lower(trim(p.invited_last_name)) <> lower(trim(v_last_name))
        )
    ) then
      raise exception 'This email is on an organizer participant list under a different name';
    end if;

    update public.student_profiles
    set first_name = v_first_name,
        last_name = v_last_name,
        email = v_email,
        college = trim(p_college),
        updated_at = now()
    where id = v_id;
  end if;

  update public.participants p
  set student_profile_id = v_id,
      display_name = sp.first_name || ' ' || sp.last_name
  from public.student_profiles sp
  where sp.id = v_id
    and p.student_profile_id is null
    and p.enrollment_source = 'spreadsheet'
    and lower(trim(p.email)) = lower(trim(sp.email))
    and lower(trim(p.invited_first_name)) = lower(trim(sp.first_name))
    and lower(trim(p.invited_last_name)) = lower(trim(sp.last_name));

  return v_id;
end;
$$;

revoke all on function public.register_student_profile(uuid,text,text,text,text) from public;
grant execute on function public.register_student_profile(uuid,text,text,text,text) to anon,authenticated;

