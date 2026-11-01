"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { batchGetFiles } from "@/lib/api";
import type { FileItem } from "@/types";
import { isNotFound } from "./lib/errors";

export const PAGE_SIZE = 40;
const MAX_BATCH = 100;

export type IdPage = { ids: string[]; total: number };
export type FetchIds = (offset: number, limit: number) => Promise<IdPage>;

type Phase = "loading" | "ready" | "failed";
type More = "idle" | "loading" | "failed";

export type PagedPhotos = {
  files: FileItem[];
  total: number | null;
  /** Ids requested so far, counting those the core no longer returns. */
  loaded: number;
  phase: Phase;
  more: More;
  moreMayFollow: boolean;
  /** Reloads the first page after a failed one. */
  retry: () => void;
  loadMore: () => void;
};

type Options = {
  /** Identity of the list; a new key is a new list. */
  listKey: string;
  fetchIds: FetchIds;
  /** Bumped by the owner to refetch what is loaded, keeping its depth. */
  refreshToken: number;
  /** How many ids the first load asks for, once. */
  restoreDepth?: number;
  onNotAvailable: () => void;
  onRefreshResult: (ok: boolean) => void;
};

async function hydrate(ids: string[]): Promise<FileItem[]> {
  const files: FileItem[] = [];
  for (let at = 0; at < ids.length; at += MAX_BATCH) {
    files.push(...(await batchGetFiles(ids.slice(at, at + MAX_BATCH))));
  }
  const byId = new Map(files.map((file) => [file.id, file]));
  return ids.flatMap((id) => {
    const file = byId.get(id);
    return file ? [file] : [];
  });
}

async function fetchDepth(fetchIds: FetchIds, depth: number): Promise<{ ids: string[]; total: number }> {
  const ids: string[] = [];
  let total = 0;
  while (ids.length < depth) {
    const want = Math.min(MAX_BATCH, depth - ids.length);
    const page = await fetchIds(ids.length, want);
    total = page.total;
    ids.push(...page.ids);
    if (page.ids.length < want || ids.length >= total) break;
  }
  return { ids, total };
}

export function usePagedPhotos(options: Options): PagedPhotos {
  const { listKey, fetchIds, refreshToken, restoreDepth } = options;
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [more, setMore] = useState<More>("idle");

  const callbacks = useRef(options);
  callbacks.current = options;
  const fetchRef = useRef(fetchIds);
  fetchRef.current = fetchIds;
  const loadedRef = useRef(0);
  const totalRef = useRef<number | null>(null);
  const filesRef = useRef<FileItem[]>([]);
  // Only the latest of overlapping loads may write; busy keeps a second
  // loadMore from asking for the same page.
  const generation = useRef(0);
  const busy = useRef(false);
  const previous = useRef<{ listKey: string; fetchIds: FetchIds; refreshToken: number } | null>(null);
  const restore = useRef(restoreDepth);

  const commit = useCallback((next: FileItem[], ids: number, count: number) => {
    filesRef.current = next;
    loadedRef.current = ids;
    totalRef.current = count;
    setFiles(next);
    setLoaded(ids);
    setTotal(count);
  }, []);

  const loadDepth = useCallback(
    async (depth: number, mode: "initial" | "refresh") => {
      const mine = ++generation.current;
      busy.current = true;
      if (mode === "initial") {
        setPhase("loading");
        setMore("idle");
      }
      try {
        const page = await fetchDepth(fetchRef.current, depth);
        const next = await hydrate(page.ids);
        if (mine !== generation.current) return;
        commit(next, page.ids.length, page.total);
        setPhase("ready");
        setMore("idle");
        if (mode === "initial") restore.current = undefined;
        else callbacks.current.onRefreshResult(true);
      } catch (error) {
        if (mine !== generation.current) return;
        if (isNotFound(error)) {
          callbacks.current.onNotAvailable();
        } else if (mode === "refresh") {
          setMore("idle");
          callbacks.current.onRefreshResult(false);
        } else {
          setPhase("failed");
        }
      } finally {
        if (mine === generation.current) busy.current = false;
      }
    },
    [commit],
  );

  useEffect(() => {
    const before = previous.current;
    previous.current = { listKey, fetchIds, refreshToken };
    if (before && before.listKey === listKey) {
      if (before.fetchIds === fetchIds && before.refreshToken === refreshToken) return;
      void loadDepth(Math.max(loadedRef.current, PAGE_SIZE), "refresh");
      return;
    }
    filesRef.current = [];
    loadedRef.current = 0;
    totalRef.current = null;
    setFiles([]);
    setLoaded(0);
    setTotal(null);
    void loadDepth(restore.current ?? PAGE_SIZE, "initial");
  }, [listKey, fetchIds, refreshToken, loadDepth]);

  useEffect(
    () => () => {
      generation.current += 1;
      previous.current = null;
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (busy.current) return;
    const offset = loadedRef.current;
    if (totalRef.current === null || offset >= totalRef.current) return;
    const mine = ++generation.current;
    busy.current = true;
    setMore("loading");
    void (async () => {
      try {
        const page = await fetchRef.current(offset, PAGE_SIZE);
        const items = await hydrate(page.ids);
        if (mine !== generation.current) return;
        commit([...filesRef.current, ...items], offset + page.ids.length, page.total);
        setMore("idle");
      } catch (error) {
        if (mine !== generation.current) return;
        if (isNotFound(error)) callbacks.current.onNotAvailable();
        else setMore("failed");
      } finally {
        if (mine === generation.current) busy.current = false;
      }
    })();
  }, [commit]);

  const retry = useCallback(() => {
    void loadDepth(Math.max(loadedRef.current, PAGE_SIZE), "initial");
  }, [loadDepth]);

  return {
    files,
    total,
    loaded,
    phase,
    more,
    moreMayFollow: total !== null && loaded < total,
    retry,
    loadMore,
  };
}
