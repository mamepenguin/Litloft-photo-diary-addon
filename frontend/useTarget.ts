"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { useMemberTarget } from "@/components/appshell/useMemberTarget";
import { getCollections, getSmartFolders } from "@/lib/api";
import { readAppTarget, writeAppTarget } from "@/lib/appPrefs";
import {
  collectionTargetId,
  parseAppTargetId,
  resolveAppTarget,
  resolveCollectionTarget,
  type AppTargetParams,
} from "@/lib/appTarget";
import { resolveMemberTarget, type MemberTarget } from "@/lib/memberTarget";
import type { CollectionSummary, FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import type { TargetParams } from "./api";

const APP = { addon: "photo_diary" } as const;
const KINDS: readonly FileKind[] = ["image"];
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

export type Target = {
  folders: LoadState<SmartFolder[]>;
  retryFolders: () => void;
  collections: LoadState<CollectionSummary[]>;
  retryCollections: () => void;
  /** A saved target's list is still being looked up, or a `?target=` is pending; no photo request may go out. */
  lookingUp: boolean;
  /** The look-up has ended and no `?target=` is pending. */
  known: boolean;
  /** A `?target=` id not yet applied or ignored. */
  pendingId: string | null;
  /** Drops a pending id unwritten, for a navigation or another menu choice. */
  dropPending: () => void;
  /** The member target's members are being evaluated; no photo request may go out. */
  evaluating: boolean;
  /** No photo request may go out before ready. */
  ready: boolean;
  /** The member evaluation failed; each surface draws its first-load failure. */
  failed: boolean;
  /** More members than one request may carry; each surface's body says the target cannot be used. */
  tooLarge: boolean;
  /** The Smart Collection in force, or `null`. */
  folder: SmartFolder | null;
  /** The collection in force, or `null`. */
  collection: CollectionSummary | null;
  /** The target in force's name; `null` for the default target and a fallback. */
  name: string | null;
  /** `default`, a Smart Collection id, or `collection:<id>`. */
  selectedId: string;
  /** What the photo routes take as query parameters; `null` is the default target or a member target. */
  params: TargetParams | null;
  /** The members every photo request carries; `null` outside a ready member target. */
  fileIds: string[] | null;
  /** The member target in force, or `null`. */
  memberTarget: MemberTarget | null;
  /** Moves on with every change of the target in force. */
  changes: number;
  choose: (id: string) => void;
  isUsable: (folder: SmartFolder) => boolean;
  /** Evaluate the member target again after a failure. */
  retryTarget: () => void;
};

/**
 * The app's target: every active image of the drive, one of its smart folders,
 * or one of its collections. A folder that is gone or cannot be listed falls
 * back to the default target while its saved id stays, as the core's apps do.
 *
 * `targetParam` is a Home shortcut's `?target=` id. It holds every request
 * back until the list of its own kind has loaded and the id is applied or
 * ignored; `onTargetHandled` fires once then, for the page to drop it from the
 * URL.
 */
export function useTarget(
  drive: string,
  targetParam: string | null = null,
  onTargetHandled?: (choice: boolean) => void,
): Target {
  const [savedId] = useState(() => readAppTarget(drive, APP));
  const [chosen, setChosen] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(() =>
    targetParam !== null ? targetParam : null,
  );
  const handled = useRef(onTargetHandled);
  handled.current = onTargetHandled;
  const loadFolders = useCallback(() => getSmartFolders(drive), [drive]);
  const { state: folders, retry: retryFolders } = useLoad(loadFolders);
  const loadCollections = useCallback(() => getCollections(drive), [drive]);
  const { state: collections, retry: retryCollections } = useLoad(loadCollections);

  const isUsable = useCallback(
    (candidate: SmartFolder) =>
      resolveMemberTarget(candidate, KINDS) !== null || resolveAppTarget(candidate, KINDS).usable,
    [],
  );

  // A pending id is resolved by the list of its own kind only.
  useEffect(() => {
    if (pendingId === null) return;
    const isCollection = pendingId.startsWith("collection:");
    let apply: string | null = null;
    if (isCollection) {
      if (collections.status === "loaded") {
        const id = pendingId.slice("collection:".length);
        if (collections.data.some((candidate) => candidate.id === id)) apply = pendingId;
      } else if (collections.status !== "failed") {
        return;
      }
    } else if (folders.status === "loaded") {
      const candidate = folders.data.find((folder) => folder.id === pendingId) ?? null;
      if (candidate !== null && isUsable(candidate)) apply = pendingId;
    } else if (folders.status !== "failed") {
      return;
    }
    const choice = apply !== null && apply !== savedId;
    if (apply !== null) {
      if (choice) writeAppTarget(drive, APP, apply);
      setChosen(apply);
    }
    setPendingId(null);
    handled.current?.(choice);
  }, [pendingId, folders, collections, drive, savedId, isUsable]);

  // A retry after a failure keeps the default target in force while the list
  // loads, so only the first look-up holds the page back.
  const [foldersSettled, setFoldersSettled] = useState(false);
  useEffect(() => {
    if (folders.status === "loaded" || folders.status === "failed") setFoldersSettled(true);
  }, [folders.status]);
  const [collectionsSettled, setCollectionsSettled] = useState(false);
  useEffect(() => {
    if (collections.status === "loaded" || collections.status === "failed") setCollectionsSettled(true);
  }, [collections.status]);

  const wanted = chosen ?? savedId;
  const wantedTarget = parseAppTargetId(wanted);
  const wantedKind = wantedTarget.kind;
  const wantedId = wantedTarget.kind === "default" ? null : wantedTarget.id;
  const foldersLoading = folders.status === "loading" || folders.status === "idle";
  const collectionsLoading = collections.status === "loading" || collections.status === "idle";
  // While an id is pending the saved target is neither looked up nor evaluated.
  const savedLookingUp =
    pendingId === null &&
    chosen === null &&
    ((wantedKind === "smart" && !foldersSettled && foldersLoading) ||
      (wantedKind === "collection" && !collectionsSettled && collectionsLoading));
  const lookingUp = pendingId !== null || savedLookingUp;

  // The listed objects keep their identity while the other list arrives, so
  // the member evaluation is not restarted by a list finishing.
  const listedFolder = useMemo(
    () =>
      pendingId === null && wantedKind === "smart" && !savedLookingUp && folders.status === "loaded"
        ? (folders.data.find((candidate) => candidate.id === wantedId) ?? null)
        : null,
    [pendingId, wantedKind, wantedId, savedLookingUp, folders],
  );
  const listedCollection = useMemo(
    () =>
      pendingId === null &&
      wantedKind === "collection" &&
      !savedLookingUp &&
      collections.status === "loaded"
        ? (collections.data.find((candidate) => candidate.id === wantedId) ?? null)
        : null,
    [pendingId, wantedKind, wantedId, savedLookingUp, collections],
  );

  const resolved = useMemo(() => resolveAppTarget(listedFolder, KINDS), [listedFolder]);
  const resolvedCollection = useMemo(
    () => (listedCollection === null ? null : resolveCollectionTarget(listedCollection, KINDS)),
    [listedCollection],
  );
  const memberTarget = useMemo(() => resolveMemberTarget(listedFolder, KINDS), [listedFolder]);
  const { evaluation, retry: retryTarget } = useMemberTarget(drive, listedFolder, memberTarget);

  const memberHasKinds = memberTarget !== null && memberTarget.kinds.length > 0;
  const evaluating = memberHasKinds && evaluation === null;
  const failed = memberHasKinds && evaluation?.status === "failed";
  const tooLarge = memberHasKinds && evaluation?.status === "tooLarge";
  const memberReady = memberHasKinds && evaluation?.status === "ready" ? evaluation : null;

  // A member target is in force whether or not the listing could normalise its
  // query; only a folder that fell back gives the default target.
  const folder = memberTarget !== null ? listedFolder : resolved.usable ? listedFolder : null;
  const collection = resolvedCollection !== null ? listedCollection : null;
  const resolvedId =
    collection !== null ? collectionTargetId(collection.id) : (folder?.id ?? DEFAULT_ID);
  // While an id is pending the menu checks its row and the control reads `…`.
  const selectedId = pendingId ?? resolvedId;
  const name = pendingId !== null ? null : (collection?.name ?? folder?.name ?? null);

  const params = useMemo<TargetParams | null>(() => {
    if (memberTarget !== null) return memberTarget.kinds.length === 0 ? { none: true } : null;
    if (resolvedCollection !== null) return wireParams(resolvedCollection.params);
    if (!resolved.usable || "empty" in resolved) return resolved.usable ? { none: true } : null;
    const wire = wireParams(resolved.params);
    return Object.keys(wire).length > 0 ? wire : null;
  }, [memberTarget, resolvedCollection, resolved]);

  // The token moves in the same render as the target, so no render pairs new
  // params with the old key and the views mount once per change. An evaluation
  // finishing or a retry is not a target change and does not move it.
  const [drawn, setDrawn] = useState<{ id: string; changes: number } | null>(null);
  if (!lookingUp) {
    if (drawn === null) setDrawn({ id: selectedId, changes: 0 });
    else if (drawn.id !== selectedId) setDrawn({ id: selectedId, changes: drawn.changes + 1 });
  }
  const changes = drawn?.changes ?? 0;

  const choose = useCallback(
    (id: string) => {
      if (pendingId !== null && id === pendingId) return;
      setPendingId(null);
      writeAppTarget(drive, APP, id);
      setChosen(id);
    },
    [drive, pendingId],
  );
  const dropPending = useCallback(() => setPendingId(null), []);

  return {
    folders,
    retryFolders,
    collections,
    retryCollections,
    lookingUp,
    known: !lookingUp,
    pendingId,
    dropPending,
    evaluating,
    ready: !lookingUp && !evaluating && !failed && !tooLarge,
    failed,
    tooLarge,
    folder,
    collection,
    name,
    selectedId,
    params,
    fileIds: memberReady?.fileIds ?? null,
    memberTarget,
    changes,
    choose,
    isUsable,
    retryTarget,
  };
}
