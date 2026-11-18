'use client';

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

function completionDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityModal({
  activity,
  onClose,
  onComplete,
}: {
  activity: ActivityModalActivity;
  onClose: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="activity-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close activity" onClick={onClose}>
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
        <button
          className="primary-button"
          disabled={activity.completed}
          onClick={() => {
            onComplete();
            onClose();
          }}
        >
          {activity.completed ? 'Completed' : 'Complete activity'}
        </button>
      </section>
    </div>
  );
}
