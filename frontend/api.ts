const BASE = "/api/addons/photo_diary";

export type Point = { file_id: string; lat: number; lon: number; taken_at: string | null };

export class ApiError extends Error {
  status: number;

  constructor(status: number, message = `HTTP ${status}`) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get<T>(drive: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${BASE}${path}${query ? `?${query}` : ""}`, {
    headers: { "X-Lit-Drive": encodeURIComponent(drive) },
  });
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

export function fetchMonths(drive: string) {
  return get<{ months: { month: string; count: number }[]; undated_count: number }>(
    drive,
    "/calendar/months",
  );
}

export function fetchDays(drive: string, month: string) {
  return get<{ days: { date: string; count: number }[] }>(drive, "/calendar/days", { month });
}

export type PhotoQuery = { date?: string; undated?: boolean; limit?: number; offset?: number };

export function fetchPhotos(drive: string, query: PhotoQuery) {
  const params: Record<string, string> = {};
  if (query.date !== undefined) params.date = query.date;
  if (query.undated) params.undated = "true";
  if (query.limit !== undefined) params.limit = String(query.limit);
  if (query.offset !== undefined) params.offset = String(query.offset);
  return get<{ file_ids: string[]; total: number }>(drive, "/photos", params);
}

export function fetchPoints(drive: string) {
  return get<{ points: Point[] }>(drive, "/points");
}

export function fetchMapConfig(drive: string) {
  return get<{ tile_url: string; attribution: string }>(drive, "/map-config");
}
