"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { batchGetFiles } from "@/lib/api";
import type { FileItem } from "@/types";
import { isNotFound } from "./lib/errors";
import type { Shelf, ShelvesPage } from "./lib/library";

const MAX_BATCH = 100;

type Snapshot = {
  fetchPage: (page: number) => Promise<ShelvesPage>;
  attempt: number;
  shelves: Shelf[];
  files: ReadonlyMap<string, FileItem>;
  total: number;
  pages: number;
  more: "idle" | "loading" | "failed";
  refreshFailed: boolean;
};

export type LibraryPages = {
  phase: "idle" | "loading" | "ready" | "failed";
  shelves: Shelf[];
  files: ReadonlyMap<string, FileItem>;
  total: number | null;
  pages: number;
  more: "idle" | "loading" | "failed";
  hasMore: boolean;
  refreshFailed: boolean;
  retry: () => void;
  retryRefresh: () => void;
  loadMore: () => void;
};

type Options = {
  fetchPage: ((page: number) => Promise<ShelvesPage>) | null;
  /** The number of shelf pages a reload starts with; applied once. */
  restorePages?: number;
  /** Bumped by the owner to read every loaded page again. */
  refreshToken: number;
  onNotAvailable: () => void;
};

/** Every id of the page once, in batches the core accepts. */
async function hydrate(ids: string[]): Promise<Map<string, FileItem>> {
  const unique = [...new Set(ids)];
  const files = new Map<string, FileItem>();
  for (let at = 0; at < unique.length; at += MAX_BATCH) {
    for (const file of await batchGetFiles(unique.slice(at, at + MAX_BATCH))) {
      files.set(file.id, file);
    }
  }
  return files;
}

const idsOf = (shelves: Shelf[]): string[] => shelves.flatMap((shelf) => shelf.file_ids);

function sameList(now: Snapshot | null, wanted: Snapshot): now is Snapshot {
  return (
    now !== null &&
    now.fetchPage === wanted.fetchPage &&
    now.attempt === wanted.attempt &&
    now.pages === wanted.pages
  );
}

/**
 * The Library's own paging: shelf pages plus the reads that turn their ids into
 * files. A page is drawn when all of its reads have answered, and an id used by
 * several shelves is read once.
 */
export function useLibraryPages(options: Options): LibraryPages {
  const { fetchPage, restorePages, refreshToken, onNotAvailable } = options;
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<Snapshot | null>(null);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const heldRef = useRef(held);
  heldRef.current = held;

  const restoreDepth = useRef(restorePages);

  useEffect(() => {
    if (!fetchPage) return;
    const pages = restoreDepth.current ?? 1;
    restoreDepth.current = undefined;
    const mine = attempt;
    let current = true;
    void (async () => {
      const answers: ShelvesPage[] = [];
      for (let page = 1; page <= pages; page += 1) {
        const answer = await fetchPage(page);
        answers.push(answer);
        if (answer.shelves.length === 0) break;
      }
      const shelves = answers.flatMap((answer) => answer.shelves);
      const files = await hydrate(idsOf(shelves));
      if (!current) return;
      const total = answers.at(-1)?.total ?? 0;
      setHeld({
        fetchPage,
        attempt: mine,
        shelves,
        files,
        total,
        pages: answers.length,
        more: "idle",
        refreshFailed: false,
      });
    })().catch((error: unknown) => {
      if (!current) return;
      if (isNotFound(error)) onNotAvailable();
      setHeld({
        fetchPage,
        attempt: mine,
        shelves: [],
        files: new Map(),
        total: 0,
        pages: 0,
        more: "idle",
        refreshFailed: false,
      });
    });
    return () => {
      current = false;
    };
  }, [fetchPage, attempt, onNotAvailable]);

  useEffect(() => {
    if (refreshToken === 0 && refreshAttempt === 0) return;
    const wanted = heldRef.current;
    if (!wanted || wanted.pages === 0) return;
    let current = true;
    void (async () => {
      const answers = await Promise.all(
        Array.from({ length: wanted.pages }, (_, index) => wanted.fetchPage(index + 1)),
      );
      const shelves = answers.flatMap((answer) => answer.shelves);
      const files = await hydrate(idsOf(shelves));
      if (!current) return;
      const total = answers.at(-1)?.total ?? 0;
      setHeld((now) =>
        sameList(now, wanted) ? { ...now, shelves, files, total, refreshFailed: false } : now,
      );
    })().catch((error: unknown) => {
      if (!current) return;
      if (isNotFound(error)) onNotAvailable();
      setHeld((now) => (sameList(now, wanted) ? { ...now, refreshFailed: true } : now));
    });
    return () => {
      current = false;
    };
  }, [refreshToken, refreshAttempt, onNotAvailable]);

  const loadMore = useCallback(() => {
    const wanted = heldRef.current;
    if (!wanted || wanted.more === "loading" || wanted.shelves.length >= wanted.total) return;
    setHeld((now) => (now === wanted ? { ...now, more: "loading" } : now));
    void (async () => {
      const answer = await wanted.fetchPage(wanted.pages + 1);
      const files = await hydrate(idsOf(answer.shelves));
      setHeld((now) =>
        sameList(now, wanted)
          ? {
              ...now,
              shelves: [...now.shelves, ...answer.shelves],
              files: new Map([...now.files, ...files]),
              // A page with nothing in it ends the list, whatever the total says.
              total: answer.shelves.length === 0 ? now.shelves.length : answer.total,
              pages: now.pages + 1,
              more: "idle",
            }
          : now,
      );
    })().catch((error: unknown) => {
      if (isNotFound(error)) onNotAvailable();
      setHeld((now) => (sameList(now, wanted) ? { ...now, more: "failed" } : now));
    });
  }, [onNotAvailable]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const retryRefresh = useCallback(() => setRefreshAttempt((value) => value + 1), []);

  const own = held && held.fetchPage === fetchPage && held.attempt === attempt ? held : null;
  const phase: LibraryPages["phase"] =
    fetchPage === null ? "idle" : own === null ? "loading" : own.pages === 0 ? "failed" : "ready";

  return {
    phase,
    shelves: own?.shelves ?? [],
    files: own?.files ?? new Map(),
    total: own?.total ?? null,
    pages: own?.pages ?? 0,
    more: own?.more ?? "idle",
    hasMore: own !== null && own.shelves.length < own.total,
    refreshFailed: own?.refreshFailed ?? false,
    retry,
    retryRefresh,
    loadMore,
  };
}
