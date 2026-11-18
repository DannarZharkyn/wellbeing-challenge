export type ChallengeProgress = {
  points: number;
  completedCount: number;
};

export function calculateProgress(completedCount: number, activityCount: number) {
  return activityCount > 0 ? Math.round((completedCount / activityCount) * 100) : 0;
}

export function calculateProfileTotals(challenges: ChallengeProgress[]) {
  return challenges.reduce(
    (totals, challenge) => ({
      points: totals.points + challenge.points,
      completed: totals.completed + challenge.completedCount,
    }),
    { points: 0, completed: 0 },
  );
}
