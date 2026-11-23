'use client';

import { useState } from 'react';
import { Logo } from '../ui';

export const participantTermsVersion = '2026-11-23-v1';

export function ParticipantAgreement({
  participantName,
  email,
  error,
  onAccept,
}: {
  participantName: string;
  email: string;
  error?: string;
  onAccept: () => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function accept() {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await onAccept();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="student-app agreement-screen">
      <section className="agreement-card">
        <Logo />
        <span className="agreement-eyebrow">PARTICIPANT AGREEMENT</span>
        <h1>Before you continue</h1>
        <p className="agreement-intro">
          Hi {participantName}. Please review and accept these terms for{' '}
          <strong>{email.toLowerCase()}</strong>.
        </p>

        <div className="agreement-terms" tabIndex={0} aria-label="Participant terms and conditions">
          <h2>Wellbeing Challenge Terms and Conditions</h2>
          <p>
            Participation is voluntary. Activities provide general wellbeing encouragement and are
            not medical advice, diagnosis, or treatment.
          </p>
          <p>
            Use reasonable judgment, follow activity instructions, and stop any activity that feels
            unsafe or unsuitable for you. Seek appropriate professional help when needed.
          </p>
          <p>
            Submit activity completions honestly and use only your own participant account. Your
            registration details, participation, team membership, completions, and points are stored
            so organizers can operate the challenge.
          </p>
          <p>
            Organizers may correct inaccurate results or remove participation that violates these
            terms. By continuing, you acknowledge these terms and the described use of your
            challenge data.
          </p>
        </div>

        <label className="agreement-check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>I have read and agree to the Terms and Conditions.</span>
        </label>

        {error && <p className="code-error">{error}</p>}
        <button className="primary-button" disabled={!agreed || submitting} onClick={accept}>
          {submitting ? 'Saving agreement…' : 'Agree and continue'}
        </button>
        <small>Agreement version {participantTermsVersion}</small>
      </section>
    </main>
  );
}
