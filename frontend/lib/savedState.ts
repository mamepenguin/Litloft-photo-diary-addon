export type SavedState = {
  center?: [number, number];
  zoom?: number;
  pointIds?: string[];
  list?: { loaded: number; scrollY: number };
  /** Which view's list `list` belongs to; absent means whichever is open. */
  listView?: "calendar" | "map";
  /** The target in force when the state was saved; absent counts as `default`. */
  target?: string;
  /** The Library's loaded depth, scroll and the choice it was recorded under. */
  library?: { loaded: number; scrollY: number; by: string; sort: string };
};

export type ShelfState = {
  by: string;
  key: string;
  sort: string;
  target: string;
  loaded: number;
  scrollY: number;
};

const key = (drive: string) => `photo_diary:state:${encodeURIComponent(drive)}`;
const shelfKey = (drive: string) => `photo_diary:shelf:${encodeURIComponent(drive)}`;

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
  const library = r.library as Record<string, unknown> | undefined;
  if (
    library &&
    isNumber(library.loaded) &&
    isNumber(library.scrollY) &&
    typeof library.by === "string" &&
    typeof library.sort === "string"
  ) {
    state.library = {
      loaded: library.loaded,
      scrollY: library.scrollY,
      by: library.by,
      sort: library.sort,
    };
  }
  return state;
}

function sanitizeShelf(raw: unknown): ShelfState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.by !== "string" ||
    typeof r.key !== "string" ||
    typeof r.sort !== "string" ||
    typeof r.target !== "string" ||
    !isNumber(r.loaded) ||
    !isNumber(r.scrollY)
  ) {
    return null;
  }
  return { by: r.by, key: r.key, sort: r.sort, target: r.target, loaded: r.loaded, scrollY: r.scrollY };
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
    sessionStorage.removeItem(shelfKey(drive));
  } catch {
    // Nothing to clear.
  }
}

export function saveShelfState(drive: string, state: ShelfState): void {
  try {
    sessionStorage.setItem(shelfKey(drive), JSON.stringify(state));
  } catch {
    // Storage full or blocked.
  }
}

export function loadShelfState(drive: string): ShelfState | null {
  try {
    const stored = sessionStorage.getItem(shelfKey(drive));
    return stored === null ? null : sanitizeShelf(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearShelfState(drive: string): void {
  try {
    sessionStorage.removeItem(shelfKey(drive));
  } catch {
    // Nothing to clear.
  }
}
