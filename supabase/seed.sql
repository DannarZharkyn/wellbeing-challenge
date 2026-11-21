-- LOCAL DEVELOPMENT DATA ONLY.
--
-- Supabase runs this file after the migrations on `supabase start` (first boot) and on
-- `supabase db reset` (npm run db:reset). It never runs in production: `supabase db push`
-- only applies seeds with --include-seed, and the project scripts never pass that flag.
--
-- Everything here uses fixed IDs and `on conflict do nothing`, so it is safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Local administrator: admin@local.test / admin123
-- ---------------------------------------------------------------------------
-- The user is looked up by email so the seed still works if someone already created it by hand.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- GoTrue fails to load users whose token columns are NULL, so they must be empty strings.
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000a001',
  'authenticated', 'authenticated',
  'admin@local.test',
  extensions.crypt('admin123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
where not exists (select 1 from auth.users where email = 'admin@local.test');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email = 'admin@local.test'
on conflict do nothing;

insert into public.admin_users (user_id, display_name)
select id, 'Local Admin' from auth.users where email = 'admin@local.test'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Demo competitions, always active: dates are relative to when the seed runs,
--    and the competitions_sync_status trigger derives the status from them.
-- ---------------------------------------------------------------------------
insert into public.competitions (
  id, name, competition_code, description, competition_type, start_at, end_at,
  rules, disclaimer, email_template, environment
) values
  (
    '20000000-0000-4000-8000-000000000001',
    'Demo Individual Challenge', 'DEMOIN',
    'Local demo data. Complete activities to earn points on the individual leaderboard.',
    'individual', now() - interval '1 day', now() + interval '30 days',
    'Complete activities honestly and safely during the competition period.',
    'Participation is voluntary. Choose activities appropriate for your needs and abilities.',
    'You are invited to join the Demo Individual Challenge.',
    'development'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Demo Team Challenge', 'DEMOGR',
    'Local demo data. Join with code DEMOGR, then create a team or use team code CRCREW or TPACK1.',
    'group', now() - interval '1 day', now() + interval '30 days',
    'Complete activities honestly and safely during the competition period.',
    'Participation is voluntary. Choose activities appropriate for your needs and abilities.',
    'You are invited to join the Demo Team Challenge.',
    'development'
  )
on conflict (id) do nothing;

insert into public.teams (id, competition_id, name, team_code) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Charles River Crew', 'CRCREW'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Terrier Pack', 'TPACK1')
on conflict do nothing;

insert into public.event_activities (competition_id, activity_id)
select competition.id, activity.id
from public.competitions competition
cross join public.activities activity
where competition.id in ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')
  and activity.is_active = true
on conflict do nothing;
