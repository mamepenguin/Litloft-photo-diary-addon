export type Step = 0 | 1 | 2 | 3 | 4;

/** Decided by the day's photo count alone, so months and drives compare. */
export function stepOf(count: number): Step {
  if (count >= 30) return 4;
  if (count >= 10) return 3;
  if (count >= 3) return 2;
  return count >= 1 ? 1 : 0;
}
