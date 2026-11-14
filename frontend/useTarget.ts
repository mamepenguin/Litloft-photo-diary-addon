"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { getSmartFolders } from "@/lib/api";
import { readAppTarget, writeAppTarget } from "@/lib/appPrefs";
import { resolveAppTarget, type AppTargetParams } from "@/lib/appTarget";
import type { SmartFolder } from "@/types/smartFolder";
import type { TargetParams } from "./api";

const APP = { addon: "photo_diary" } as const;
const KINDS = ["image"] as const;
const DEFAULT_ID = "default";

function list(value: string | readonly string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? [value] : [...value];
}

function wireParams(params: AppTargetParams): TargetParams {
  const out: TargetParams = {};
  if (params.search !== undefined) out.search = params.search;
  if (params.tag !== undefined) out.tag = list(params.tag);
  if (params.folder !== undefined) out.folder = list(params.folder);
  if (params.collection !== undefined) out.collection = list(params.collection);
  if (params.size !== undefined) out.size = list(params.size);
  if (params.favorite) out.favorite = true;
  if (params.liked) out.liked = true;
  return out;
}

function usableTarget(folder: SmartFolder | null) {
  return resolveAppTarget(folder, KINDS);
}

export type Target = {
  folders: LoadState<SmartFolder[]>;
  retryFolders: () => void;
  /** The saved folder is still being looked up; no photo request may go out. */
  lookingUp: boolean;
  /** No photo request may go out before the look-up has ended. */
  ready: boolean;
  /** The folder in force, or `null` for the default target or a fallback. */
  folder: SmartFolder | null;
  /** `default` or the id of the folder in force. */
  selectedId: string;
  /** What the photo routes take; `null` is the default target. */
  params: TargetParams | null;
  /** Moves on with every change of the target in force. */
  changes: number;
  choose: (id: string) => void;
  isUsable: (folder: SmartFolder) => boolean;
};

/**
 * The app's target: every active image of the drive, or one of its smart
 * folders. A folder that is gone or cannot be resolved falls back to the
 * default target while its saved id stays, as the core's apps do.
 */
export function useTarget(drive: string): Target {
  const [savedId] = useState(() => readAppTarget(drive, APP));
  const [chosen, setChosen] = useState<string | null>(null);
  const loadFolders = useCallback(() => getSmartFolders(drive), [drive]);
  const { state: folders, retry: retryFolders } = useLoad(loadFolders);

  // A retry after a failure keeps the default target in force while the list
  // loads, so only the first look-up holds the page back.
  const [settledOnce, setSettledOnce] = useState(false);
  useEffect(() => {
    if (folders.status === "loaded" || folders.status === "failed") setSettledOnce(true);
  }, [folders.status]);

  const wanted = chosen ?? savedId;
  const loading = folders.status === "loading" || folders.status === "idle";
  const lookingUp = chosen === null && !settledOnce && wanted !== DEFAULT_ID && loading;

  const listed = useMemo(
    () => (lookingUp || folders.status !== "loaded" ? null : (folders.data.find((f) => f.id === wanted) ?? null)),
    [lookingUp, folders, wanted],
  );
  const resolved = useMemo(() => usableTarget(listed), [listed]);
  const folder = resolved.usable ? listed : null;
  const params = useMemo(() => {
    if (listed === null || !resolved.usable) return null;
    if ("empty" in resolved) return { none: true as const };
    const wire = wireParams(resolved.params);
    return Object.keys(wire).length > 0 ? wire : null;
  }, [listed, resolved]);

  const selectedId = folder?.id ?? DEFAULT_ID;
  // The token moves in the same render as the target, so no render pairs new
  // params with the old key and the views mount once per change.
  const [drawn, setDrawn] = useState<{ id: string; changes: number } | null>(null);
  if (!lookingUp) {
    if (drawn === null) setDrawn({ id: selectedId, changes: 0 });
    else if (drawn.id !== selectedId) setDrawn({ id: selectedId, changes: drawn.changes + 1 });
  }
  const changes = drawn?.changes ?? 0;

  const choose = useCallback(
    (id: string) => {
      writeAppTarget(drive, APP, id);
      setChosen(id);
    },
    [drive],
  );

  const isUsable = useCallback((candidate: SmartFolder) => usableTarget(candidate).usable, []);

  return {
    folders,
    retryFolders,
    lookingUp,
    ready: !lookingUp,
    folder,
    selectedId,
    params,
    changes,
    choose,
    isUsable,
  };
}
