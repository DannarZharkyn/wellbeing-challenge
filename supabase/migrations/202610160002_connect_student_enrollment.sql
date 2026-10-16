-- DESIGN DECISION: A student profile is stored once, while participation remains one row per competition.
-- Group competition codes enroll a student as unassigned; team-specific codes also create the membership.
create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  email text not null,
  college text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists student_profiles_normalized_email_key on public.student_profiles (lower(trim(email)));

alter table public.participants add column if not exists student_profile_id uuid references public.student_profiles(id) on delete cascade;
create unique index if not exists participants_competition_student_key on public.participants (competition_id, student_profile_id) where student_profile_id is not null;
create unique index if not exists activity_completions_once_key on public.activity_completions (competition_id, participant_id, activity_id);

alter table public.student_profiles enable row level security;
drop policy if exists "Admins manage student profiles" on public.student_profiles;
create policy "Admins manage student profiles" on public.student_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update, delete on public.student_profiles to authenticated;

-- PROTOTYPE: The browser keeps this UUID as its temporary identity. These functions avoid exposing tables directly to anonymous clients.
-- TODO(PRODUCTION): Replace the caller-supplied profile UUID with auth.uid(), verified BU email ownership, rate limiting, and audited enrollment changes.
create or replace function public.register_student_profile(p_profile_id uuid, p_first_name text, p_last_name text, p_email text, p_college text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if trim(p_first_name) = '' or trim(p_last_name) = '' or position('@' in p_email) < 2 or trim(p_college) = '' then raise exception 'Complete all registration fields'; end if;
  select id into v_id from public.student_profiles where id = p_profile_id or lower(trim(email)) = lower(trim(p_email)) limit 1;
  if v_id is null then
    insert into public.student_profiles(first_name,last_name,email,college)
    values(initcap(lower(trim(p_first_name))),initcap(lower(trim(p_last_name))),lower(trim(p_email)),trim(p_college)) returning id into v_id;
  else
    update public.student_profiles set first_name=initcap(lower(trim(p_first_name))),last_name=initcap(lower(trim(p_last_name))),email=lower(trim(p_email)),college=trim(p_college),updated_at=now() where id=v_id;
  end if;
  return v_id;
end; $$;

create or replace function public.list_public_individual_competitions()
returns table(id uuid,name text,description text,competition_type text,status text,start_at timestamptz,end_at timestamptz,competition_code text,activity_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id,c.name,c.description,c.competition_type,c.status,c.start_at,c.end_at,c.competition_code,count(ea.activity_id)
  from public.competitions c left join public.event_activities ea on ea.competition_id=c.id
  where c.competition_type='individual' and c.status in ('scheduled','active') and c.end_at>now()
  group by c.id order by c.start_at;
$$;

create or replace function public.list_student_enrollments(p_profile_id uuid)
returns table(participant_id uuid,competition_id uuid,name text,description text,competition_type text,status text,start_at timestamptz,end_at timestamptz,competition_code text,team_name text,points integer,activity_count bigint,completed_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id,c.id,c.name,c.description,c.competition_type,c.status,c.start_at,c.end_at,c.competition_code,max(t.name),p.points,count(distinct ea.activity_id),count(distinct ac.id)
  from public.participants p join public.competitions c on c.id=p.competition_id
  left join public.team_memberships tm on tm.participant_id=p.id left join public.teams t on t.id=tm.team_id
  left join public.event_activities ea on ea.competition_id=c.id left join public.activity_completions ac on ac.participant_id=p.id
  where p.student_profile_id=p_profile_id group by p.id,c.id order by c.start_at;
$$;

create or replace function public.join_individual_competition(p_profile_id uuid,p_competition_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_profile public.student_profiles%rowtype; v_id uuid;
begin
  select * into v_profile from public.student_profiles where id=p_profile_id;
  if v_profile.id is null then raise exception 'Student profile not found'; end if;
  if not exists(select 1 from public.competitions where id=p_competition_id and competition_type='individual' and status in ('scheduled','active') and end_at>now()) then raise exception 'Competition is not available'; end if;
  insert into public.participants(competition_id,student_profile_id,display_name,email)
  values(p_competition_id,v_profile.id,v_profile.first_name||' '||v_profile.last_name,v_profile.email)
  on conflict (competition_id,student_profile_id) where student_profile_id is not null do update set display_name=excluded.display_name,email=excluded.email returning id into v_id;
  return v_id;
end; $$;

create or replace function public.find_group_competition(p_code text)
returns table(competition_id uuid,competition_name text,team_id uuid,team_name text)
language sql stable security definer set search_path = public as $$
  select c.id,c.name,t.id,t.name from public.competitions c left join public.teams t on t.competition_id=c.id and upper(t.team_code)=upper(trim(p_code))
  where c.competition_type='group' and c.status in ('scheduled','active') and c.end_at>now()
    and (upper(c.competition_code)=upper(trim(p_code)) or t.id is not null)
  order by (t.id is not null) desc limit 1;
$$;

create or replace function public.join_group_competition(p_profile_id uuid,p_code text)
returns table(participant_id uuid,competition_id uuid,competition_name text,team_name text)
language plpgsql security definer set search_path = public as $$
declare v_profile public.student_profiles%rowtype; v_competition uuid; v_name text; v_team uuid; v_team_name text; v_participant uuid;
begin
  select * into v_profile from public.student_profiles where id=p_profile_id;
  if v_profile.id is null then raise exception 'Student profile not found'; end if;
  select f.competition_id,f.competition_name,f.team_id,f.team_name into v_competition,v_name,v_team,v_team_name from public.find_group_competition(p_code) f;
  if v_competition is null then raise exception 'Invitation code is not valid'; end if;
  insert into public.participants(competition_id,student_profile_id,display_name,email)
  values(v_competition,v_profile.id,v_profile.first_name||' '||v_profile.last_name,v_profile.email)
  on conflict (competition_id,student_profile_id) where student_profile_id is not null do update set display_name=excluded.display_name,email=excluded.email returning id into v_participant;
  if v_team is not null then insert into public.team_memberships(team_id,participant_id) values(v_team,v_participant) on conflict do nothing; end if;
  return query select v_participant,v_competition,v_name,v_team_name;
end; $$;

create or replace function public.leave_competition(p_profile_id uuid,p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin delete from public.participants where student_profile_id=p_profile_id and competition_id=p_competition_id; end; $$;

create or replace function public.list_enrolled_activities(p_profile_id uuid,p_competition_id uuid)
returns table(id uuid,title text,description text,dimension text,completion_type text,duration_minutes integer,points integer,completed boolean)
language sql stable security definer set search_path = public as $$
  select a.id,a.title,a.description,a.dimension,a.completion_type,a.duration_minutes,a.points,exists(select 1 from public.activity_completions ac where ac.participant_id=p.id and ac.activity_id=a.id)
  from public.participants p join public.event_activities ea on ea.competition_id=p.competition_id join public.activities a on a.id=ea.activity_id
  where p.student_profile_id=p_profile_id and p.competition_id=p_competition_id and a.is_active=true order by a.dimension,a.title;
$$;

create or replace function public.complete_enrolled_activity(p_profile_id uuid,p_competition_id uuid,p_activity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_participant uuid; v_points integer;
begin
  select id into v_participant from public.participants where student_profile_id=p_profile_id and competition_id=p_competition_id;
  select a.points into v_points from public.activities a join public.event_activities ea on ea.activity_id=a.id where ea.competition_id=p_competition_id and a.id=p_activity_id;
  if v_participant is null or v_points is null then raise exception 'Enrollment or activity not found'; end if;
  insert into public.activity_completions(competition_id,participant_id,activity_id,points_awarded) values(p_competition_id,v_participant,p_activity_id,v_points) on conflict do nothing;
  update public.participants set points=(select coalesce(sum(points_awarded),0) from public.activity_completions where participant_id=v_participant) where id=v_participant;
end; $$;

revoke all on function public.register_student_profile(uuid,text,text,text,text),public.list_public_individual_competitions(),public.list_student_enrollments(uuid),public.join_individual_competition(uuid,uuid),public.find_group_competition(text),public.join_group_competition(uuid,text),public.leave_competition(uuid,uuid),public.list_enrolled_activities(uuid,uuid),public.complete_enrolled_activity(uuid,uuid,uuid) from public;
grant execute on function public.register_student_profile(uuid,text,text,text,text),public.list_public_individual_competitions(),public.list_student_enrollments(uuid),public.join_individual_competition(uuid,uuid),public.find_group_competition(text),public.join_group_competition(uuid,text),public.leave_competition(uuid,uuid),public.list_enrolled_activities(uuid,uuid),public.complete_enrolled_activity(uuid,uuid,uuid) to anon,authenticated;
