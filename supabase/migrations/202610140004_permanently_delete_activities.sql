-- DESIGN DECISION: The administrator-facing trash action permanently deletes the selected activity.
-- TODO(PRODUCTION): Prevent deletion when an activity is referenced by competition history, or migrate to explicit archival at that point.
drop function if exists public.archive_activity(uuid);

create or replace function public.delete_activity(activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  delete from public.activities where id = activity_id;
end;
$$;

revoke all on function public.delete_activity(uuid) from public, anon;
grant execute on function public.delete_activity(uuid) to authenticated;

-- Remove rows previously hidden by the old soft-delete behavior.
delete from public.activities where is_active = false;
