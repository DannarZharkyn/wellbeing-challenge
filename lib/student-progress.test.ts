import { calculateProfileTotals, calculateProgress } from './student-progress';

describe('calculateProgress', () => {
  it('calculates and rounds challenge completion from completed activities', () => {
    expect(calculateProgress(3, 14)).toBe(21);
    expect(calculateProgress(7, 14)).toBe(50);
    expect(calculateProgress(14, 14)).toBe(100);
  });

  it('returns zero when a challenge has no activities', () => {
    expect(calculateProgress(0, 0)).toBe(0);
  });
});

describe('calculateProfileTotals', () => {
  it('adds points and completed activities across joined challenges', () => {
    expect(
      calculateProfileTotals([
        { points: 80, completedCount: 2 },
        { points: 45, completedCount: 1 },
      ]),
    ).toEqual({ points: 125, completed: 3 });
  });

  it('returns empty totals when the student has not joined a challenge', () => {
    expect(calculateProfileTotals([])).toEqual({ points: 0, completed: 0 });
  });
});
