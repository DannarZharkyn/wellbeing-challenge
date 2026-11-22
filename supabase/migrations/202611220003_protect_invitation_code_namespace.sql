-- Competition and team codes share one student-facing input. Keep their namespace
-- unambiguous so a code can never resolve to an unintended competition or team.
create unique index if not exists competitions_normalized_competition_code_key
  on public.competitions (upper(trim(competition_code)));

create or replace function public.enforce_invitation_code_namespace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if tg_table_name = 'competitions' then
    v_code := upper(trim(new.competition_code));
  else
    v_code := upper(trim(new.team_code));
  end if;

  if v_code = '' then
    raise exception 'Invitation code cannot be empty';
  end if;

  -- Serialize attempts to claim the same normalized code across both tables.
  perform pg_advisory_xact_lock(hashtextextended('wellbeing-invitation-code:' || v_code, 0));

  if tg_table_name = 'competitions' then
    if exists (
      select 1 from public.teams t
      where upper(trim(t.team_code)) = v_code
    ) then
      raise exception using
        errcode = '23505',
        message = 'That invitation code is already being used by a team';
    end if;
    new.competition_code := v_code;
  else
    if exists (
      select 1 from public.competitions c
      where upper(trim(c.competition_code)) = v_code
    ) then
      raise exception using
        errcode = '23505',
        message = 'That invitation code is already being used by a competition';
    end if;
    new.team_code := v_code;
  end if;

  return new;
end;
$$;

drop trigger if exists competitions_protect_invitation_code on public.competitions;
create trigger competitions_protect_invitation_code
before insert or update of competition_code on public.competitions
for each row execute function public.enforce_invitation_code_namespace();

drop trigger if exists teams_protect_invitation_code on public.teams;
create trigger teams_protect_invitation_code
before insert or update of team_code on public.teams
for each row execute function public.enforce_invitation_code_namespace();
