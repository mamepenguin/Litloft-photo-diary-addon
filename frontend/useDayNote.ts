"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createNote, fetchNote, fetchNoteText, restoreNote, type NoteInfo, type NoteState } from "./api";
import { isNotFound } from "./lib/errors";

/** What Retry reads again: `note` and `gone` read /note and the text, `stream` only the text. */
type Failure = "note" | "stream" | "gone";
export type NoteMessage = "start" | "rescan" | "restoreFailed";

export type DayNote = {
  info: NoteInfo | null;
  text: string | null;
  failure: Failure | null;
  message: NoteMessage | null;
  busy: boolean;
  /** Text drawn, another state known, or the first read failed. Stays true once reached. */
  settled: boolean;
  write: () => void;
  restore: () => void;
  retry: () => void;
};

type Scope = { date: string | null };
type Model = Omit<DayNote, "write" | "restore" | "retry"> & { scope: Scope };
type TextResult = { text: string } | { status: number } | null;

const blank = (scope: Scope): Model => ({
  scope,
  info: null,
  text: null,
  failure: null,
  message: null,
  busy: false,
  settled: false,
});

const modelOf = (ref: { current: Model }, s: Scope): Model => (ref.current.scope === s ? ref.current : blank(s));

const GONE = new Set([404, 410]);
const editorHref = (fileId: string | null) => `/files/${fileId}?edit=1`;

type Props = {
  drive: string;
  /** The open day, or null when the page shows no note area. */
  date: string | null;
  /** Whether the calendar is the view on screen. */
  active: boolean;
  /** Changes whenever the page asks for everything to be read again. */
  token: number;
  refresh: () => void;
  /** A read found a state other than the one drawn, so what the calendar marks may be stale. */
  onStateChanged: () => void;
  onNotAvailable: () => void;
};

/**
 * The note of the open day.
 *
 * A scope is one visit to one day of one drive. Every request carries the
 * scope it began in and changes nothing once the viewer has left it, which is
 * also what keeps a day's old data from reappearing when the viewer returns.
 */
export function useDayNote({ drive, date, active, token, refresh, onStateChanged, onNotAvailable }: Props): DayNote {
  const router = useRouter();
  const id = date === null ? null : `${drive}\n${date}`;
  const visit = useRef({ id, scope: { date } as Scope });
  if (visit.current.id !== id) visit.current = { id, scope: { date } };
  const scope = visit.current.scope;

  const [shown, setShown] = useState<Model>(() => blank(scope));
  const model = useRef(shown);
  const live = useRef(scope);
  live.current = scope;

  const commit = useCallback((s: Scope, patch: Partial<Model>) => {
    if (live.current !== s) return;
    model.current = { ...modelOf(model, s), ...patch };
    setShown(model.current);
  }, []);

  const noteSeq = useRef(0);
  const textSeq = useRef(0);
  const busyScope = useRef<Scope | null>(null);
  const queued = useRef<Scope | null>(null);

  const readNote = useCallback(
    async (s: Scope): Promise<NoteInfo | null> => {
      if (s.date === null) return null;
      const seq = ++noteSeq.current;
      try {
        const info = await fetchNote(drive, s.date);
        return seq === noteSeq.current && live.current === s ? info : null;
      } catch (error) {
        if (seq !== noteSeq.current || live.current !== s) return null;
        if (isNotFound(error)) onNotAvailable();
        else commit(s, { failure: "note", settled: modelOf(model, s).settled || modelOf(model, s).info === null });
        return null;
      }
    },
    [drive, commit, onNotAvailable],
  );

  const loadText = useCallback(
    async (s: Scope, fileId: string): Promise<TextResult> => {
      const seq = ++textSeq.current;
      try {
        const text = await fetchNoteText(fileId);
        return seq === textSeq.current && live.current === s ? { text } : null;
      } catch (error) {
        if (seq !== textSeq.current || live.current !== s) return null;
        return { status: error instanceof ApiError ? error.status : 0 };
      }
    },
    [],
  );

  const follow = useCallback(
    (s: Scope, info: NoteInfo) => {
      const before = modelOf(model, s);
      const changed =
        before.info === null || before.info.state !== info.state || before.info.file_id !== info.file_id;
      if (before.info !== null && before.info.state !== info.state) onStateChanged();
      commit(s, {
        info,
        ...(changed ? { text: null, message: null, failure: null } : {}),
        ...(!changed && before.failure === "note" ? { failure: null } : {}),
        settled: before.settled || info.state !== "active",
      });
    },
    [commit, onStateChanged],
  );

  const showText = useCallback(
    (s: Scope, result: Exclude<TextResult, null>) => {
      if ("text" in result) commit(s, { text: result.text, failure: null, settled: true });
      else commit(s, { failure: GONE.has(result.status) ? "gone" : "stream", settled: true });
    },
    [commit],
  );

  // The core's stream answers 404 or 410 for a row whose file has left the
  // disk. /note is read once more before deciding, and only on the first
  // such answer, so nothing repeats by itself.
  const settle = useCallback(
    async (s: Scope, first: NoteInfo, recheck: boolean): Promise<void> => {
      let info = first;
      let mayRecheck = recheck;
      for (;;) {
        follow(s, info);
        if (info.state !== "active" || info.file_id === null) return;
        const result = await loadText(s, info.file_id);
        if (result === null) return;
        if (mayRecheck && "status" in result && GONE.has(result.status)) {
          mayRecheck = false;
          const again = await readNote(s);
          if (again === null) return;
          if (again.state !== "active" || again.file_id !== info.file_id) {
            info = again;
            continue;
          }
        }
        showText(s, result);
        return;
      }
    },
    [follow, loadText, readNote, showText],
  );

  const read = useCallback(
    async (s: Scope, recheck = true) => {
      const info = await readNote(s);
      if (info !== null) await settle(s, info, recheck);
    },
    [readNote, settle],
  );

  // After a write or a restore that did not go through: the state is read
  // again, and the message stays only while the answer is the one it describes.
  const afterFailure = useCallback(
    async (s: Scope, still: NoteState, message: NoteMessage) => {
      const info = await readNote(s);
      if (info === null) return;
      if (info.state === still) {
        follow(s, info);
        commit(s, { message });
      } else {
        await settle(s, info, true);
      }
    },
    [readNote, follow, commit, settle],
  );

  const begin = useCallback(
    (s: Scope): boolean => {
      if (live.current !== s || busyScope.current === s) return false;
      busyScope.current = s;
      commit(s, { busy: true, message: null });
      return true;
    },
    [commit],
  );

  // A read asked for while busy waits for the end, unless the caller reads
  // the state itself.
  const end = useCallback(
    (s: Scope, readQueued: boolean) => {
      const waiting = queued.current === s;
      if (busyScope.current === s) busyScope.current = null;
      queued.current = null;
      commit(s, { busy: false });
      if (waiting && readQueued) void read(s);
    },
    [commit, read],
  );

  useEffect(() => {
    if (id === null || !active) return;
    if (busyScope.current === live.current) {
      queued.current = live.current;
      return;
    }
    void read(live.current);
  }, [id, active, token, read]);

  const write = useCallback(async () => {
    const s = live.current;
    const info = modelOf(model, s).info;
    if (s.date === null || info === null) return;
    if (info.state === "empty") {
      router.push(editorHref(info.file_id));
      return;
    }
    if (info.state !== "none" || !begin(s)) return;
    try {
      const created = await createNote(drive, s.date);
      if (live.current !== s) end(s, false);
      else router.push(editorHref(created.id));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (live.current !== s) end(s, false);
      else if (status === 404) {
        end(s, false);
        onNotAvailable();
      } else if (status === 409) {
        end(s, false);
        await afterFailure(s, "none", "rescan");
      } else {
        commit(s, { message: "start" });
        end(s, true);
      }
    }
  }, [begin, commit, drive, end, afterFailure, onNotAvailable, router]);

  const restore = useCallback(async () => {
    const s = live.current;
    const info = modelOf(model, s).info;
    if (info?.state !== "trashed" || info.file_id === null || !begin(s)) return;
    let restored = true;
    try {
      await restoreNote(info.file_id);
    } catch {
      restored = false;
    }
    end(s, false);
    if (live.current !== s) return;
    if (restored) refresh();
    else await afterFailure(s, "trashed", "restoreFailed");
  }, [begin, end, afterFailure, refresh]);

  const retry = useCallback(async () => {
    const s = live.current;
    const { failure, info } = modelOf(model, s);
    if (failure === "stream" && info?.state === "active" && info.file_id !== null) {
      const result = await loadText(s, info.file_id);
      if (result !== null) showText(s, result);
    } else {
      await read(s, false);
    }
  }, [loadText, read, showText]);

  const view = shown.scope === scope ? shown : blank(scope);
  return {
    info: view.info,
    text: view.text,
    failure: view.failure,
    message: view.message,
    busy: view.busy,
    settled: view.settled,
    write: () => void write(),
    restore: () => void restore(),
    retry: () => void retry(),
  };
}
