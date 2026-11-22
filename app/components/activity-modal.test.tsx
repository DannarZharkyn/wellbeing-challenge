import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ActivityModal,
  type ActivityModalActivity,
  type TimedActivityControls,
} from './activity-modal';

const activity: ActivityModalActivity = {
  id: 'activity-1',
  title: 'Take a mindful campus walk',
  detail: 'Walk outside without using your phone.',
  dimension: 'Environmental',
  type: 'Timed',
  duration: 10,
  points: 50,
  completed: false,
};

const controls = (readyAt: string): TimedActivityControls => ({
  storageKey: 'test-timed-activity',
  competitionId: 'competition-1',
  start: jest.fn().mockResolvedValue({
    token: 'attempt-1',
    startedAt: '2026-11-18T15:00:00Z',
    readyAt,
  }),
  resume: jest.fn().mockResolvedValue(null),
  cancel: jest.fn().mockResolvedValue(undefined),
});

describe('ActivityModal', () => {
  beforeEach(() => sessionStorage.clear());

  it('shows the activity instructions, duration, and points', () => {
    render(
      <ActivityModal
        activity={activity}
        onClose={jest.fn()}
        onComplete={jest.fn().mockResolvedValue(undefined)}
        timedControls={controls('2026-11-18T15:10:00Z')}
      />,
    );

    expect(screen.getByRole('heading', { name: activity.title })).toBeInTheDocument();
    expect(screen.getByText(activity.detail)).toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('50 points')).toBeInTheDocument();
  });

  it('starts a timed activity without completing it immediately', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const timedControls = controls(new Date(Date.now() + 10 * 60_000).toISOString());
    render(
      <ActivityModal
        activity={activity}
        onClose={onClose}
        onComplete={onComplete}
        timedControls={timedControls}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Start activity' }));

    expect(timedControls.start).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Activity in progress' })).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('finishes a timed activity only after the server says it is ready', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(
      <ActivityModal
        activity={activity}
        onClose={onClose}
        onComplete={onComplete}
        timedControls={controls('2026-11-18T15:00:01Z')}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Start activity' }));
    await user.click(await screen.findByRole('button', { name: 'Finish activity' }));

    expect(onComplete).toHaveBeenCalledWith('attempt-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps daily check-ins as immediate completions', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn().mockResolvedValue(undefined);
    render(
      <ActivityModal
        activity={{ ...activity, type: 'Daily check-in', duration: 0 }}
        onClose={jest.fn()}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Complete activity' }));

    expect(onComplete).toHaveBeenCalledWith(undefined);
  });

  it('does not allow an already completed activity to be submitted again', () => {
    render(
      <ActivityModal
        activity={{ ...activity, completed: true, completedAt: '2026-11-18T15:30:00Z' }}
        onClose={jest.fn()}
        onComplete={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  });
});
