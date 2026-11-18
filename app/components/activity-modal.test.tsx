import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityModal, type ActivityModalActivity } from './activity-modal';

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

describe('ActivityModal', () => {
  it('shows the activity instructions, duration, and points', () => {
    render(<ActivityModal activity={activity} onClose={jest.fn()} onComplete={jest.fn()} />);

    expect(screen.getByRole('heading', { name: activity.title })).toBeInTheDocument();
    expect(screen.getByText(activity.detail)).toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('50 points')).toBeInTheDocument();
  });

  it('submits the completion and closes the modal', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    const onClose = jest.fn();
    render(<ActivityModal activity={activity} onClose={onClose} onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: 'Complete activity' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not allow an already completed activity to be submitted again', () => {
    render(
      <ActivityModal
        activity={{ ...activity, completed: true, completedAt: '2026-11-18T15:30:00Z' }}
        onClose={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  });
});
