export type SavedState = {
  center?: [number, number];
  zoom?: number;
  pointIds?: string[];
  list?: { loaded: number; scrollY: number };
  /** Which view's list `list` belongs to; absent means whichever is open. */
  listView?: "calendar" | "map";
  /** The target in force when the state was saved; absent counts as `default`. */
  target?: string;
};

const key = (drive: string) => `photo_diary:state:${encodeURIComponent(drive)}`;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function sanitize(raw: unknown): SavedState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const state: SavedState = {};
  if (Array.isArray(r.center) && r.center.length === 2 && r.center.every(isNumber)) {
    state.center = [r.center[0], r.center[1]];
  }
  if (isNumber(r.zoom)) state.zoom = r.zoom;
  if (Array.isArray(r.pointIds) && r.pointIds.every((id) => typeof id === "string")) {
    state.pointIds = r.pointIds as string[];
  }
  const list = r.list as Record<string, unknown> | undefined;
  if (list && isNumber(list.loaded) && isNumber(list.scrollY)) {
    state.list = { loaded: list.loaded, scrollY: list.scrollY };
  }
  if (r.listView === "calendar" || r.listView === "map") state.listView = r.listView;
  if (typeof r.target === "string") state.target = r.target;
  return state;
}

/** Never throws: when storage refuses, Back starts fresh. */
export function saveState(drive: string, state: SavedState): void {
  try {
    sessionStorage.setItem(key(drive), JSON.stringify(state));
  } catch {
    // Storage full or blocked.
  }
}

export function loadState(drive: string): SavedState | null {
  try {
    const stored = sessionStorage.getItem(key(drive));
    return stored === null ? null : sanitize(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearState(drive: string): void {
  try {
    sessionStorage.removeItem(key(drive));
  } catch {
    // Nothing to clear.
  }
}
