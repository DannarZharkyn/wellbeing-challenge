-- DESIGN DECISION: A team with no memberships has no active participants and should
-- not remain visible or reserve its name/code. Participants and their points remain
-- intact because only the empty team record is removed.
create or replace function public.delete_team_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.teams t
  where t.id = old.team_id
    and not exists (
      select 1 from public.team_memberships tm where tm.team_id = old.team_id
    );
  return old;
end;
$$;

drop trigger if exists delete_empty_team_after_membership_removal on public.team_memberships;
create trigger delete_empty_team_after_membership_removal
after delete on public.team_memberships
for each row execute function public.delete_team_when_empty();

-- Remove orphaned teams created before this trigger existed.
delete from public.teams t
where not exists (
  select 1 from public.team_memberships tm where tm.team_id = t.id
);

