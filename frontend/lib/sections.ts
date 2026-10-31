import type { Point } from "../api";

export type Section = { date: string | null; count: number; fileIds: string[] };

/**
 * One section per capture date, newest first, then the photos with no capture
 * date. Inside a section the order is the order of `points`.
 */
export function groupSections(points: Point[], onlyIds?: string[]): Section[] {
  const keep = onlyIds ? new Set(onlyIds) : null;
  const byDate = new Map<string, string[]>();
  const undated: string[] = [];

  for (const point of points) {
    if (keep && !keep.has(point.file_id)) continue;
    if (point.taken_at === null) {
      undated.push(point.file_id);
      continue;
    }
    const date = point.taken_at.slice(0, 10);
    const ids = byDate.get(date);
    if (ids) ids.push(point.file_id);
    else byDate.set(date, [point.file_id]);
  }

  const sections: Section[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, fileIds]) => ({ date, count: fileIds.length, fileIds }));
  if (undated.length > 0) sections.push({ date: null, count: undated.length, fileIds: undated });
  return sections;
}
