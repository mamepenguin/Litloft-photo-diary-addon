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

type Query = Record<string, string | string[]>;

/** A target's conditions, as the photo routes take them. */
export type TargetParams = {
  search?: string;
  tag?: string[];
  folder?: string[];
  collection?: string[];
  size?: string[];
  favorite?: true;
  liked?: true;
  none?: true;
};

function targetQuery(target: TargetParams | null | undefined): Query {
  if (!target) return {};
  const params: Query = {};
  if (target.search !== undefined) params.search = target.search;
  for (const key of ["tag", "folder", "collection", "size"] as const) {
    const values = target[key];
    if (values && values.length > 0) params[key] = values;
  }
  if (target.favorite) params.favorite = "true";
  if (target.liked) params.liked = "true";
  if (target.none) params.none = "true";
  return params;
}

async function get<T>(drive: string, path: string, params: Query = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }
  const search = query.toString();
  const response = await fetch(`${BASE}${path}${search ? `?${search}` : ""}`, {
    headers: { "X-Lit-Drive": encodeURIComponent(drive) },
  });
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

export function fetchMonths(drive: string, target?: TargetParams) {
  return get<{ months: { month: string; count: number }[]; undated_count: number }>(
    drive,
    "/calendar/months",
    targetQuery(target),
  );
}

export type DayEntry = { date: string; count: number; has_note?: boolean };

export function fetchDays(drive: string, month: string, target?: TargetParams) {
  return get<{ days: DayEntry[] }>(drive, "/calendar/days", { ...targetQuery(target), month });
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

export type PhotoQuery = {
  date?: string;
  undated?: boolean;
  limit?: number;
  offset?: number;
} & TargetParams;

export function fetchPhotos(drive: string, query: PhotoQuery) {
  const params: Query = targetQuery(query);
  if (query.date !== undefined) params.date = query.date;
  if (query.undated) params.undated = "true";
  if (query.limit !== undefined) params.limit = String(query.limit);
  if (query.offset !== undefined) params.offset = String(query.offset);
  return get<{ file_ids: string[]; total: number }>(drive, "/photos", params);
}

export function fetchPoints(drive: string, target?: TargetParams) {
  return get<{ points: Point[] }>(drive, "/points", targetQuery(target));
}

export function fetchMapConfig(drive: string) {
  return get<{ tile_url: string; attribution: string }>(drive, "/map-config");
}
