import { expect, test, type Page, type Route } from '@playwright/test';

const profileId = '11111111-1111-4111-8111-111111111111';
const competitionId = '22222222-2222-4222-8222-222222222222';
const activityId = '33333333-3333-4333-8333-333333333333';
const attemptToken = '44444444-4444-4444-8444-444444444444';

type JourneyState = {
  joined: boolean;
  completed: boolean;
};

const competition = {
  id: competitionId,
  competition_id: competitionId,
  name: 'Playwright Wellbeing Challenge',
  description:
    'A safe browser-test challenge that never touches production data. This deliberately long description verifies that competition information stays compact before a student joins, while still allowing the student to expand and read every detail when they choose.',
  competition_type: 'individual',
  status: 'active',
  start_at: '2026-11-01T14:00:00.000Z',
  end_at: '2026-12-31T22:00:00.000Z',
  activity_count: 1,
  completed_count: 0,
  points: 0,
};

const activity = {
  id: activityId,
  title: 'Take a ten-minute mindful walk',
  description: 'Walk without your phone and notice your surroundings.',
  dimension: 'Environmental',
  completion_type: 'timed',
  duration_minutes: 10,
  points: 50,
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(body) });
}

async function mockStudentBackend(page: Page, state: JourneyState) {
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const rpc = new URL(route.request().url()).pathname.split('/').pop();
    switch (rpc) {
      case 'list_public_individual_competitions':
        await fulfillJson(route, state.joined ? [] : [competition]);
        return;
      case 'register_student_profile':
        await fulfillJson(route, profileId);
        return;
      case 'get_student_profile':
        await fulfillJson(route, [
          {
            first_name: 'Avery',
            last_name: 'Tester',
            email: 'avery.tester@bu.edu',
            college: 'College of Arts & Sciences',
          },
        ]);
        return;
      case 'list_student_enrollments':
        await fulfillJson(
          route,
          state.joined
            ? [
                {
                  ...competition,
                  completed_count: state.completed ? 1 : 0,
                  points: state.completed ? 50 : 0,
                },
              ]
            : [],
        );
        return;
      case 'get_competition_join_preview':
        await fulfillJson(route, [
          {
            ...competition,
            participant_count: 4,
          },
        ]);
        return;
      case 'join_individual_competition':
        state.joined = true;
        await fulfillJson(route, null);
        return;
      case 'list_enrolled_activities':
        await fulfillJson(route, [
          {
            ...activity,
            completed: state.completed,
            completed_at: state.completed ? '2026-11-18T17:00:00.000Z' : null,
          },
        ]);
        return;
      case 'start_timed_activity':
      case 'get_timed_activity_attempt':
        await fulfillJson(route, [
          {
            attempt_token: attemptToken,
            started_at: '2026-11-18T16:50:00.000Z',
            ready_at: '2026-11-18T17:00:00.000Z',
          },
        ]);
        return;
      case 'cancel_timed_activity':
        await fulfillJson(route, null);
        return;
      case 'complete_timed_activity_with_progress':
        state.completed = true;
        await fulfillJson(route, [
          {
            participant_points: 50,
            completed_count: 1,
            activity_count: 1,
          },
        ]);
        return;
      default:
        await route.fulfill({
          status: 500,
          headers: corsHeaders,
          body: JSON.stringify({ message: `Unexpected test RPC: ${rpc}` }),
        });
    }
  });
}

test('a new student registers, joins a challenge, and completes an activity', async ({ page }) => {
  const state: JourneyState = { joined: false, completed: false };
  page.on('pageerror', (error) => console.error(`Browser error: ${error.message}`));
  await page.clock.setFixedTime(new Date('2026-11-18T17:00:00.000Z'));
  await mockStudentBackend(page, state);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Start your wellbeing journey' })).toBeVisible();
  await page.getByLabel('First name').fill('Avery');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email address').fill('avery.tester@bu.edu');
  await page.getByLabel('College').selectOption({ label: 'College of Arts & Sciences' });
  await page.getByRole('button', { name: /Get Started/i }).click();

  await expect(page.getByRole('heading', { name: 'Welcome, Avery!' })).toBeVisible();
  await expect(page.getByText('Playwright Wellbeing Challenge')).toBeVisible();

  await page.getByRole('button', { name: 'View & Join' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Playwright Wellbeing Challenge' }),
  ).toBeVisible();
  await expect(page.getByText('4', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join challenge' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();
  await page.getByRole('button', { name: 'Show less' }).click();
  await page.getByRole('button', { name: 'Join challenge' }).click();

  await expect(page).toHaveURL('/challenges');
  await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible();
  await page.getByRole('button', { name: /Playwright Wellbeing Challenge/ }).click();

  await expect(page).toHaveURL(`/challenges/${competitionId}`);
  const activityCard = page
    .getByRole('heading', { level: 3, name: 'Take a ten-minute mindful walk' })
    .locator('..')
    .locator('..');
  await expect(activityCard).toBeVisible();
  await activityCard.getByRole('button').click();

  await expect(
    page.getByRole('heading', { level: 2, name: 'Take a ten-minute mindful walk' }),
  ).toBeVisible();
  await expect(page.getByText('50 points')).toBeVisible();
  await page.getByRole('button', { name: 'Start activity' }).click();
  await expect(page.getByText('Activity time complete')).toBeVisible();
  await page.getByRole('button', { name: 'Finish activity' }).click();

  await expect(page.getByText('100%')).toBeVisible();
  await expect(page.getByText('Everything is completed!')).toBeVisible();
  await page.getByRole('button', { name: /Completed/ }).click();
  await expect(page.getByText(/Completed Nov 18, 2026/)).toBeVisible();

  await page.getByRole('button', { name: 'Profile' }).last().click();
  await expect(page).toHaveURL('/profile');
  await expect(page.getByText('50', { exact: true })).toBeVisible();
  await expect(page.getByText('Points', { exact: true })).toBeVisible();
  await expect(page.getByText('1', { exact: true })).toHaveCount(2);
});
