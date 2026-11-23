import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipantAgreement } from './participant-agreement';

describe('ParticipantAgreement', () => {
  it('requires an unchecked participant agreement before continuing', async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn().mockResolvedValue(undefined);
    render(
      <ParticipantAgreement
        participantName="Avery"
        email="Avery.Tester@bu.edu"
        onAccept={onAccept}
      />,
    );

    const continueButton = screen.getByRole('button', { name: 'Agree and continue' });
    expect(continueButton).toBeDisabled();
    expect(screen.getByText('avery.tester@bu.edu')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.click(continueButton);

    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
