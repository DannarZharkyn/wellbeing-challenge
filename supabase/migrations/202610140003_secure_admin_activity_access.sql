-- DESIGN DECISION: Database authorization is based on an allowlist of Supabase Auth user IDs, not on a client-side route check.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Prototype can create activities" on public.activities;
drop policy if exists "Prototype can archive activities" on public.activities;

create policy "Administrators can create activities"
  on public.activities for insert to authenticated
  with check (public.is_admin());

create policy "Administrators can update activities"
  on public.activities for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, update on public.activities from anon;
grant insert, update on public.activities to authenticated;

-- TODO(PRODUCTION): Add an audit table before expanding administrative mutations beyond the activity library.
create or replace function public.archive_activity(activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  update public.activities set is_active = false, updated_at = now()
  where id = activity_id and is_active = true;
end;
$$;

revoke all on function public.archive_activity(uuid) from public, anon;
grant execute on function public.archive_activity(uuid) to authenticated;
