type MonthCounts = { months: { count: number }[]; undated_count: number };

/** Every photo of the drive that the addon lists: dated and undated. */
export const photoTotal = (counts: MonthCounts): number =>
  counts.months.reduce((sum, month) => sum + month.count, counts.undated_count);
