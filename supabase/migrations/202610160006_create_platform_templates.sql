-- DESIGN DECISION: These records are platform defaults, not competition content. A competition receives a text snapshot at creation so later template edits never rewrite an existing competition.
create table if not exists public.platform_templates (
  template_key text primary key check (template_key in ('participant_rules', 'participant_disclaimer', 'invitation_message')),
  content text not null check (char_length(trim(content)) > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_templates enable row level security;

drop policy if exists "Administrators read platform templates" on public.platform_templates;
drop policy if exists "Administrators update platform templates" on public.platform_templates;

create policy "Administrators read platform templates"
  on public.platform_templates for select to authenticated
  using (public.is_admin());

create policy "Administrators update platform templates"
  on public.platform_templates for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.platform_templates to authenticated;

insert into public.platform_templates (template_key, content)
values
  ('participant_rules', E'Competition rules:\n\n1. Complete activities honestly and only during the competition period.\n2. Respect other participants, Boston University property, and all University policies.\n3. Never complete an activity in a private, restricted, or unsafe area.\n4. Group members may complete assigned activities together unless an activity says otherwise.\n5. Points and leaderboard positions are part of a friendly wellbeing challenge. Administrators may review unusual activity before confirming results.'),
  ('participant_disclaimer', E'Well-Being Challenge — Participation Acknowledgment\n\nParticipation is voluntary. Activities are intended to encourage healthy routines and community connection; they do not replace medical, mental health, nutritional, or financial advice.\n\nParticipants are responsible for making safe choices, considering their individual needs and abilities, and stopping any activity that causes pain, distress, or discomfort. No activity requires entering a restricted area, sharing private information, or taking an unreasonable risk.\n\nCompetition participation, activity completions, team membership, and points may be stored and reviewed to administer the challenge. Final wording should be reviewed by the sponsoring Boston University office before publication.'),
  ('invitation_message', E'You are invited to join a Boston University Well-Being Challenge.\n\nOpen the competition link or scan the QR code, review the participant rules and disclaimer, and then join as an individual or through your assigned team invitation. Complete activities, earn points, and follow your progress throughout the competition.')
on conflict (template_key) do nothing;

-- TODO(PRODUCTION): Add a template-version history table if administrators need audit, rollback, or approval workflows.
