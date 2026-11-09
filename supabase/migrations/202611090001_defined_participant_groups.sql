-- DESIGN DECISION: A defined-participant group competition pre-creates unassigned participant rows.
-- Those rows are linked to a student profile only when first name, last name, and email all match.
alter table public.participants
  add column if not exists invited_first_name text,
  add column if not exists invited_last_name text,
  add column if not exists enrollment_source text not null default 'self_joined'
    check (enrollment_source in ('self_joined', 'spreadsheet'));

create unique index if not exists participants_competition_normalized_email_key
  on public.participants (competition_id, lower(trim(email)))
  where email is not null;

-- PROTOTYPE: The browser parses the workbook and sends only the three required fields.
-- TODO(PRODUCTION): Store the original file in protected storage and record import metadata for auditing.
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

  insert into public.participants (
    competition_id,
    student_profile_id,
    display_name,
    email,
    invited_first_name,
    invited_last_name,
    enrollment_source
  )
  select
    p_competition_id,
    case
      when lower(trim(sp.first_name)) = lower(trim(x.first_name))
       and lower(trim(sp.last_name)) = lower(trim(x.last_name))
      then sp.id
      else null
    end,
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

revoke all on function public.import_competition_participants(uuid, jsonb) from public, anon;
grant execute on function public.import_competition_participants(uuid, jsonb) to authenticated;

-- DESIGN DECISION: Returning students keep the canonical profile already associated with their unique email.
-- New profiles are automatically attached to matching spreadsheet invitations across active competitions.
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
begin
  if trim(p_first_name) = '' or trim(p_last_name) = '' or position('@' in p_email) < 2 or trim(p_college) = '' then
    raise exception 'Complete all registration fields';
  end if;

  if p_profile_id is not null then
    select id into v_id from public.student_profiles where id = p_profile_id;
    if v_id is null then raise exception 'Student profile not found'; end if;
    update public.student_profiles
    set first_name = initcap(lower(trim(p_first_name))),
        last_name = initcap(lower(trim(p_last_name))),
        email = lower(trim(p_email)),
        college = trim(p_college),
        updated_at = now()
    where id = v_id;
  else
    select id into v_id
    from public.student_profiles
    where lower(trim(email)) = lower(trim(p_email))
    limit 1;

    if v_id is null then
      insert into public.student_profiles(first_name, last_name, email, college)
      values(
        initcap(lower(trim(p_first_name))),
        initcap(lower(trim(p_last_name))),
        lower(trim(p_email)),
        trim(p_college)
      )
      returning id into v_id;
    end if;
  end if;

  -- Existing-email sign-ins use the stored canonical name. This prevents a different name from
  -- claiming a spreadsheet invitation merely by entering the invited email address.
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

create or replace function public.get_student_profile(p_profile_id uuid)
returns table(id uuid, first_name text, last_name text, email text, college text)
language sql
stable
security definer
set search_path = public
as $$
  select sp.id, sp.first_name, sp.last_name, sp.email, sp.college
  from public.student_profiles sp
  where sp.id = p_profile_id;
$$;

revoke all on function public.get_student_profile(uuid) from public;
grant execute on function public.get_student_profile(uuid) to anon, authenticated;

-- DESIGN DECISION: Library activities are individually selectable even when the organizer starts
-- from "all existing activities". Imported activities still use normalized title + dimension deduplication.
create or replace function public.assign_competition_activities_v2(
  p_competition_id uuid,
  p_mode text,
  p_library_activity_ids uuid[] default '{}'::uuid[],
  p_activities jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_mode not in ('library', 'csv', 'combined') then raise exception 'Unknown activity selection mode'; end if;
  if not exists (select 1 from public.competitions where id = p_competition_id) then raise exception 'Competition not found'; end if;

  if p_mode in ('library', 'combined') and coalesce(array_length(p_library_activity_ids, 1), 0) = 0 then
    raise exception 'Select at least one library activity';
  end if;
  if p_mode in ('csv', 'combined') and (jsonb_typeof(p_activities) <> 'array' or jsonb_array_length(p_activities) = 0) then
    raise exception 'The uploaded spreadsheet does not contain activities';
  end if;

  if p_mode in ('library', 'combined') then
    insert into public.event_activities (competition_id, activity_id)
    select p_competition_id, a.id
    from public.activities a
    where a.is_active = true and a.id = any(p_library_activity_ids)
    on conflict do nothing;
  end if;

  if p_mode in ('csv', 'combined') then
    if exists (
      select 1 from jsonb_to_recordset(p_activities) as x(title text, dimension text)
      where char_length(trim(coalesce(x.title, ''))) not between 2 and 160
         or x.dimension not in ('Environmental','Social','Emotional','Financial','Intellectual','Spiritual','Physical')
    ) then raise exception 'The spreadsheet contains an invalid title or wellbeing dimension'; end if;

    insert into public.activities (title, description, dimension, completion_type, duration_minutes, points, is_active)
    select distinct on (x.dimension, lower(regexp_replace(trim(x.title), '\s+', ' ', 'g')))
      trim(x.title),
      'Complete this wellbeing activity: ' || trim(x.title) || '.',
      x.dimension,
      'daily_check_in',
      null,
      30,
      true
    from jsonb_to_recordset(p_activities) as x(title text, dimension text)
    order by x.dimension, lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
    on conflict do nothing;

    update public.activities a
    set is_active = true, updated_at = now()
    from jsonb_to_recordset(p_activities) as x(title text, dimension text)
    where a.dimension = x.dimension
      and lower(regexp_replace(trim(a.title), '\s+', ' ', 'g')) = lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
      and a.is_active = false;

    insert into public.event_activities (competition_id, activity_id)
    select distinct p_competition_id, a.id
    from public.activities a
    join jsonb_to_recordset(p_activities) as x(title text, dimension text)
      on a.dimension = x.dimension
     and lower(regexp_replace(trim(a.title), '\s+', ' ', 'g')) = lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
    on conflict do nothing;
  end if;

  select count(*) into v_count from public.event_activities where competition_id = p_competition_id;
  return v_count;
end;
$$;

revoke all on function public.assign_competition_activities_v2(uuid, text, uuid[], jsonb) from public, anon;
grant execute on function public.assign_competition_activities_v2(uuid, text, uuid[], jsonb) to authenticated;

update public.platform_templates
set content = replace(replace(content, 'Well-Being', 'Wellbeing'), 'well-being', 'wellbeing'),
    updated_at = now()
where content like '%Well-Being%' or content like '%well-being%';
