-- Reconcile production with the administrator-only activity access introduced by
-- 202610140003_secure_admin_activity_access.sql. The prototype policies remained
-- in production after earlier migrations were applied outside the CLI history.
drop policy if exists "Prototype can create activities" on public.activities;
drop policy if exists "Prototype can archive activities" on public.activities;
drop policy if exists "Prototype can delete activities" on public.activities;

-- Keep direct anonymous access read-only. Administrators mutate activities through
-- authenticated policies or the guarded delete_activity function.
revoke all privileges on table public.activities from anon;
grant select on table public.activities to anon;

revoke all privileges on table public.activities from authenticated;
grant select, insert, update on table public.activities to authenticated;
