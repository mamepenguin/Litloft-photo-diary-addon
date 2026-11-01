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

export type DayEntry = { date: string; count: number; has_note?: boolean };

export function fetchDays(drive: string, month: string) {
  return get<{ days: DayEntry[] }>(drive, "/calendar/days", { month });
}

export type NoteState = "none" | "empty" | "active" | "trashed" | "missing";
export type NoteInfo = { state: NoteState; file_id: string | null };

export function fetchNote(drive: string, date: string) {
  return get<NoteInfo>(drive, "/note", { date });
}

async function core(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

/** The note's text from the core. `no-cache` because a copy kept by heuristic would show the text from before the last save. */
export async function fetchNoteText(fileId: string): Promise<string> {
  const response = await core(`/api/files/${encodeURIComponent(fileId)}/stream`, { cache: "no-cache" });
  return response.text();
}

/** Creates the date's empty note file; `conflict_mode: "error"` makes the core refuse rather than overwrite. */
export async function createNote(drive: string, date: string): Promise<{ id: string }> {
  const response = await core(`/api/drives/${encodeURIComponent(drive)}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `Photo Diary/${date}.md`, content: "", conflict_mode: "error" }),
  });
  return (await response.json()) as { id: string };
}

export async function restoreNote(fileId: string): Promise<void> {
  await core(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
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
