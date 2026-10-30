-- DESIGN DECISION: Spreadsheet imports use the same central activity records as manually created activities.
-- A competition only stores activity IDs, so edits and reporting continue to use one canonical library.
create or replace function public.assign_competition_activities(
  p_competition_id uuid,
  p_mode text,
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
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_mode not in ('library', 'csv', 'combined') then
    raise exception 'Unknown activity selection mode';
  end if;

  if not exists (select 1 from public.competitions where id = p_competition_id) then
    raise exception 'Competition not found';
  end if;

  if p_mode in ('csv', 'combined') and (
    jsonb_typeof(p_activities) <> 'array' or jsonb_array_length(p_activities) = 0
  ) then
    raise exception 'The uploaded spreadsheet does not contain activities';
  end if;

  if p_mode in ('library', 'combined') then
    insert into public.event_activities (competition_id, activity_id)
    select p_competition_id, a.id
    from public.activities a
    where a.is_active = true
    on conflict do nothing;
  end if;

  if p_mode in ('csv', 'combined') then
    -- CSV VALIDATION: Every item must have a 2-160 character title and one of the seven dimensions.
    if exists (
      select 1
      from jsonb_to_recordset(p_activities) as x(title text, dimension text)
      where char_length(trim(coalesce(x.title, ''))) not between 2 and 160
         or x.dimension not in (
           'Environmental', 'Social', 'Emotional', 'Financial',
           'Intellectual', 'Spiritual', 'Physical'
         )
    ) then
      raise exception 'The spreadsheet contains an invalid title or well-being dimension';
    end if;

    -- DATA HANDLING: The expression index on dimension + normalized title is the final concurrency-safe
    -- duplicate guard. DISTINCT ON also removes duplicates within a single uploaded file.
    insert into public.activities (
      title, description, dimension, completion_type, duration_minutes, points, is_active
    )
    select distinct on (
      x.dimension,
      lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
    )
      trim(x.title),
      'Complete this well-being activity: ' || trim(x.title) || '.',
      x.dimension,
      'daily_check_in',
      null,
      30,
      true
    from jsonb_to_recordset(p_activities) as x(title text, dimension text)
    order by
      x.dimension,
      lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
    on conflict do nothing;

    -- An archived matching activity is reused instead of creating a duplicate, and becomes available again.
    update public.activities a
    set is_active = true, updated_at = now()
    from jsonb_to_recordset(p_activities) as x(title text, dimension text)
    where a.dimension = x.dimension
      and lower(regexp_replace(trim(a.title), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
      and a.is_active = false;

    insert into public.event_activities (competition_id, activity_id)
    select distinct p_competition_id, a.id
    from public.activities a
    join jsonb_to_recordset(p_activities) as x(title text, dimension text)
      on a.dimension = x.dimension
     and lower(regexp_replace(trim(a.title), '\s+', ' ', 'g')) =
         lower(regexp_replace(trim(x.title), '\s+', ' ', 'g'))
    on conflict do nothing;
  end if;

  select count(*) into v_count
  from public.event_activities
  where competition_id = p_competition_id;

  return v_count;
end;
$$;

-- PROTOTYPE: The browser sends parsed rows to this RPC. The database validates them again and performs
-- the import atomically. TODO(PRODUCTION): Store import audit records and original files if rollback is needed.
revoke all on function public.assign_competition_activities(uuid, text, jsonb) from public, anon;
grant execute on function public.assign_competition_activities(uuid, text, jsonb) to authenticated;
