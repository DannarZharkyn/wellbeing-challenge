-- DESIGN DECISION: Persist status from the schedule whenever competition dates are written.
-- The UI also derives status from timestamps so it changes as time passes without a manual edit.
create or replace function public.set_competition_status_from_dates()
returns trigger language plpgsql set search_path = public as $$
begin
  new.status := case
    when new.end_at <= now() then 'ended'
    when new.start_at <= now() then 'active'
    else 'scheduled'
  end;
  return new;
end; $$;

drop trigger if exists competitions_sync_status on public.competitions;
create trigger competitions_sync_status
before insert or update of start_at, end_at on public.competitions
for each row execute function public.set_competition_status_from_dates();

update public.competitions
set status = case
  when end_at <= now() then 'ended'
  when start_at <= now() then 'active'
  else 'scheduled'
end;

-- Re-registering with the same case-insensitive email reuses the existing student profile.
create unique index if not exists student_profiles_normalized_email_key
on public.student_profiles (lower(trim(email)));
