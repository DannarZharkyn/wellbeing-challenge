'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Dimension } from '../prototype-data';
import { DimensionIcon, Icon } from '../ui';

export type ActivityModalActivity = {
  id: string;
  title: string;
  detail: string;
  dimension: Dimension;
  type: 'Timed' | 'Daily check-in';
  duration: number;
  points: number;
  completed: boolean;
  completedAt?: string;
};

export type TimedActivityAttempt = {
  token: string;
  startedAt: string;
  readyAt: string;
};

export type TimedActivityControls = {
  storageKey: string;
  competitionId: string;
  start: () => Promise<TimedActivityAttempt>;
  resume: (token: string) => Promise<TimedActivityAttempt | null>;
  cancel: (token: string) => Promise<void>;
};

type StoredTimedAttempt = {
  competitionId: string;
  activityId: string;
  token: string;
};

function completionDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function countdown(value: number) {
  const totalSeconds = Math.max(0, Math.ceil(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function readAttempt(key: string) {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '') as StoredTimedAttempt;
  } catch {
    return null;
  }
}

function removeAttempt(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function saveAttempt(key: string, attempt: StoredTimedAttempt) {
  try {
    sessionStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    // The server timer still works, but this tab cannot restore it after refresh.
  }
}

export function ActivityModal({
  activity,
  onClose,
  onComplete,
  timedControls,
}: {
  activity: ActivityModalActivity;
  onClose: () => void;
  onComplete: (attemptToken?: string) => Promise<void>;
  timedControls?: TimedActivityControls;
}) {
  const [attempt, setAttempt] = useState<TimedActivityAttempt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const timed = activity.type === 'Timed' && !activity.completed;
  const remaining = attempt ? Math.max(0, new Date(attempt.readyAt).getTime() - now) : 0;
  const total = attempt
    ? new Date(attempt.readyAt).getTime() - new Date(attempt.startedAt).getTime()
    : activity.duration * 60_000;
  const progress = attempt && total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;

  useEffect(() => {
    if (!timed || !timedControls) return;
    const stored = readAttempt(timedControls.storageKey);
    if (
      !stored ||
      stored.competitionId !== timedControls.competitionId ||
      stored.activityId !== activity.id
    )
      return;
    let active = true;
    void timedControls
      .resume(stored.token)
      .then((restored) => {
        if (!active) return;
        if (restored) {
          setAttempt(restored);
          setNow(Date.now());
        } else removeAttempt(timedControls.storageKey);
      })
      .catch((resumeError: Error) => {
        if (active) setError(resumeError.message);
      });
    return () => {
      active = false;
    };
  }, [activity.id, timed, timedControls]);

  useEffect(() => {
    if (!attempt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attempt]);

  const abandon = useCallback(async () => {
    if (!attempt || !timedControls) return;
    removeAttempt(timedControls.storageKey);
    setAttempt(null);
    try {
      await timedControls.cancel(attempt.token);
    } catch {
      // Starting another attempt invalidates an abandoned server session.
    }
  }, [attempt, timedControls]);

  useEffect(() => {
    if (!attempt) return;
    const handleBack = () => {
      if (window.confirm('Leaving will reset your activity timer. Leave this activity?')) {
        void abandon();
        onClose();
      } else {
        window.history.forward();
      }
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [abandon, attempt, onClose]);

  async function requestClose() {
    if (attempt && !window.confirm('Leaving will reset your activity timer. Leave this activity?'))
      return;
    if (attempt) await abandon();
    onClose();
  }

  async function start() {
    if (!timedControls) return;
    setWorking(true);
    setError('');
    try {
      const started = await timedControls.start();
      saveAttempt(timedControls.storageKey, {
        competitionId: timedControls.competitionId,
        activityId: activity.id,
        token: started.token,
      });
      setAttempt(started);
      setNow(Date.now());
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : 'The timer could not be started.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function complete() {
    setWorking(true);
    setError('');
    try {
      await onComplete(attempt?.token);
      if (timedControls) removeAttempt(timedControls.storageKey);
      setAttempt(null);
      onClose();
    } catch (completionError) {
      setError(
        completionError instanceof Error
          ? completionError.message
          : 'The activity could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => void requestClose()}>
      <section className="activity-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button
          className="modal-close"
          aria-label="Close activity"
          onClick={() => void requestClose()}
        >
          <Icon name="close" />
        </button>
        <DimensionIcon dimension={activity.dimension} size="lg" />
        <span className="modal-dimension">{activity.dimension}</span>
        <h2>{activity.title}</h2>
        <p>{activity.detail}</p>
        <div className="modal-meta">
          <span>
            <Icon name="clock" />
            {activity.completedAt
              ? completionDate(activity.completedAt)
              : activity.type === 'Timed'
                ? `${activity.duration} minutes`
                : 'Daily check-in'}
          </span>
          <span>
            <Icon name="spark" />
            {activity.points} points
          </span>
        </div>
        {attempt && (
          <div className="timer-demo" aria-live="polite">
            <span>{remaining > 0 ? 'Activity in progress' : 'Activity time complete'}</span>
            <strong>{countdown(remaining)}</strong>
            <div>
              <i style={{ width: `${progress}%` }} />
            </div>
            <p>Keep this tab open. Refreshing or locking your screen will not stop the timer.</p>
            {remaining > 0 && (
              <button disabled={working} onClick={() => void requestClose()}>
                Cancel activity
              </button>
            )}
          </div>
        )}
        {error && <p className="code-error">{error}</p>}
        <button
          className="primary-button"
          disabled={activity.completed || working || Boolean(attempt && remaining > 0)}
          onClick={() => void (timed && !attempt ? start() : complete())}
        >
          {activity.completed
            ? 'Completed'
            : working
              ? 'Please wait…'
              : timed && !attempt
                ? 'Start activity'
                : attempt
                  ? remaining > 0
                    ? 'Activity in progress'
                    : 'Finish activity'
                  : 'Complete activity'}
        </button>
      </section>
    </div>
  );
}
