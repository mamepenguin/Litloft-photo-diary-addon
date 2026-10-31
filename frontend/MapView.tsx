"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { MapPinOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/Button";
import { fetchMapConfig, fetchPoints, type Point } from "./api";
import { isNotFound } from "./lib/errors";
import { LoadError } from "./LoadError";
import { PhotoList, type ListPosition } from "./PhotoList";
import { SectionedGrids } from "./SectionedGrids";
import { groupSections } from "./lib/sections";
import { createPhotoMap, WebGLUnavailableError, type PhotoMap } from "./map/createPhotoMap";
import type { FetchIds } from "./usePagedPhotos";

type Phase = "loading" | "failed" | "empty" | "creating" | "ready" | "libFailed" | "noWebgl";
type LngLat = [number, number];
type MapConfig = { tile_url: string; attribution: string };

export type MapRestore = {
  center?: LngLat;
  zoom?: number;
  pointIds?: string[];
  list?: { loaded: number; scrollY: number };
};

type Props = {
  drive: string;
  active: boolean;
  restore: MapRestore;
  positionRef: MutableRefObject<ListPosition | null>;
  onView: (center: LngLat, zoom: number) => void;
  onPointIds: (ids: string[] | null) => void;
  onRestored: () => void;
  onNotAvailable: () => void;
};

const PANEL_CLASS =
  "absolute inset-x-0 bottom-0 z-10 max-h-[60%] rounded-t-xl border-t border-bg-border bg-bg-primary p-4 " +
  "@3xl:static @3xl:max-h-none @3xl:w-[22rem] @3xl:shrink-0 @3xl:rounded-none @3xl:border-l @3xl:border-t-0";

function sameMembers(open: string[] | null, ids: string[]): boolean {
  if (open === null || open.length !== ids.length) return false;
  const members = new Set(open);
  return ids.every((id) => members.has(id));
}

function reduceTo(ids: string[], points: Point[]): string[] {
  const present = new Set(points.map((p) => p.file_id));
  const kept = ids.filter((id) => present.has(id));
  return kept.length === ids.length ? ids : kept;
}

export function MapView({
  drive,
  active,
  restore,
  positionRef,
  onView,
  onPointIds,
  onRestored,
  onNotAvailable,
}: Props) {
  const t = useTranslations("photoDiary");

  const [phase, setPhase] = useState<Phase>("loading");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [openIds, setOpenIds] = useState<string[] | null>(null);
  const [listError, setListError] = useState<{ retry: () => void } | null>(null);
  const [listSeq, setListSeq] = useState(0);
  const [listToken, setListToken] = useState(0);
  const [tileFailing, setTileFailing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [token, setToken] = useState(0);

  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<PhotoMap | null>(null);
  const config = useRef<MapConfig | null>(null);
  const pointsRef = useRef<Point[] | null>(null);
  const openIdsRef = useRef<string[] | null>(null);
  const viewRef = useRef<{ center: LngLat; zoom: number } | null>(
    restore.center ? { center: restore.center, zoom: restore.zoom ?? 15 } : null,
  );
  const request = useRef(0);
  const reason = useRef<"enter" | "refresh">("enter");
  const unavailable = useRef(false);
  const restoredList = useRef(false);
  const restoreSeq = useRef<number | null>(null);

  const applyOpenIds = useCallback(
    (ids: string[] | null) => {
      openIdsRef.current = ids;
      setOpenIds(ids);
      onPointIds(ids);
    },
    [onPointIds],
  );

  const handlers = useRef({ applyOpenIds, onView });
  handlers.current = { applyOpenIds, onView };

  useEffect(() => {
    if (!active || unavailable.current) return;
    const mine = ++request.current;
    const why = reason.current;
    reason.current = "enter";
    if (pointsRef.current === null) setPhase("loading");

    Promise.all([
      config.current ? Promise.resolve(config.current) : fetchMapConfig(drive),
      fetchPoints(drive),
    ]).then(
      ([loadedConfig, loaded]) => {
        if (mine !== request.current) return;
        config.current = loadedConfig;
        pointsRef.current = loaded.points;
        setPoints(loaded.points);
        setRefreshFailed(false);

        let ids = openIdsRef.current;
        if (!restoredList.current) {
          restoredList.current = true;
          if (restore.pointIds && loaded.points.length > 0) {
            const kept = reduceTo(restore.pointIds, loaded.points);
            if (kept.length > 0) {
              ids = kept;
              restoreSeq.current = 1;
              setListSeq(1);
            }
          }
        }
        if (ids !== null) {
          const kept = reduceTo(ids, loaded.points);
          if (kept.length === 0) handlers.current.applyOpenIds(null);
          else if (kept !== openIdsRef.current) handlers.current.applyOpenIds(kept);
        }

        if (loaded.points.length === 0) {
          handle.current?.destroy();
          handle.current = null;
          setTileFailing(false);
          setPhase("empty");
        } else if (handle.current) {
          handle.current.setPoints(loaded.points);
          setPhase("ready");
        } else {
          setPhase("creating");
        }
        if (why === "refresh") setListToken((value) => value + 1);
      },
      (error: unknown) => {
        if (mine !== request.current) return;
        if (isNotFound(error)) {
          unavailable.current = true;
          onNotAvailable();
        } else if (pointsRef.current !== null) setRefreshFailed(true);
        else setPhase("failed");
      },
    );
    // `restore` is the page's first-mount state and does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive, active, token, onNotAvailable]);

  useEffect(() => {
    if (phase !== "creating" || !host.current || !pointsRef.current || !config.current) return;
    let cancelled = false;
    const used = pointsRef.current;
    const view = viewRef.current;
    createPhotoMap(host.current, {
      points: used,
      tileUrl: config.current.tile_url,
      attribution: config.current.attribution,
      center: view?.center,
      zoom: view?.zoom,
      onPointClick: (ids) => {
        if (sameMembers(openIdsRef.current, ids)) return;
        setListError(null);
        setListSeq((value) => value + 1);
        handlers.current.applyOpenIds(ids);
      },
      onPointError: (_error, retry) => {
        setListSeq((value) => value + 1);
        handlers.current.applyOpenIds(null);
        setListError({ retry });
      },
      onTileFailureChange: setTileFailing,
      onViewChange: (center, zoom) => {
        viewRef.current = { center, zoom };
        handlers.current.onView(center, zoom);
      },
    }).then(
      (created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        handle.current = created;
        if (pointsRef.current !== used && pointsRef.current) created.setPoints(pointsRef.current);
        setPhase("ready");
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof WebGLUnavailableError) {
          unavailable.current = true;
          setPhase("noWebgl");
        } else setPhase("libFailed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(
    () => () => {
      handle.current?.destroy();
      handle.current = null;
    },
    [],
  );

  const sections = useMemo(() => groupSections(points ?? [], openIds ?? []), [points, openIds]);
  const orderedKey = sections.flatMap((s) => s.fileIds).join("\n");
  const orderedIds = useMemo(() => (orderedKey ? orderedKey.split("\n") : []), [orderedKey]);
  const fetchIds = useCallback<FetchIds>(
    async (offset, limit) => ({ ids: orderedIds.slice(offset, offset + limit), total: orderedIds.length }),
    [orderedIds],
  );

  const refresh = useCallback(() => {
    reason.current = "refresh";
    setToken((value) => value + 1);
  }, []);
  const retryLoad = useCallback(() => {
    setPhase("loading");
    setToken((value) => value + 1);
  }, []);
  const closeList = useCallback(() => {
    setListError(null);
    handlers.current.applyOpenIds(null);
  }, []);
  const onListResult = useCallback((ok: boolean) => setRefreshFailed(!ok), []);

  const listKey = `point:${listSeq}`;
  const showMap = phase === "creating" || phase === "ready";

  return (
    <div className="@container px-4 pb-6">
      {refreshFailed && <LoadError onRetry={refresh} />}
      {phase === "failed" && <LoadError onRetry={retryLoad} />}
      {phase === "libFailed" && <LoadError onRetry={retryLoad} />}

      {phase === "loading" && (
        <div className="h-[24rem] animate-pulse rounded-xl bg-bg-elevated" aria-busy="true" />
      )}

      {phase === "empty" && (
        <div className="flex flex-col items-center gap-3 py-12 text-text-muted">
          <MapPinOff size={24} aria-hidden="true" />
          <p className="text-sm">{t("noLocatedPhotos")}</p>
        </div>
      )}

      {phase === "noWebgl" && (
        <div className="flex flex-col items-center gap-3 py-12 text-text-muted">
          <MapPinOff size={24} aria-hidden="true" />
          <p className="text-sm">{t("noWebgl")}</p>
        </div>
      )}

      {showMap && (
        <div className="relative flex h-[70dvh] min-h-[24rem] overflow-hidden rounded-xl border border-bg-border">
          <div ref={host} className="relative h-full min-w-0 flex-1" aria-busy={phase === "creating"} />
          {tileFailing && (
            <div
              role="status"
              className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-2xl border border-bg-border bg-bg-card px-4 py-2 text-sm text-text-primary"
            >
              {t("tileError")}
            </div>
          )}
          {openIds !== null && (
            <PhotoList
              key={listKey}
              listKey={listKey}
              fetchIds={fetchIds}
              refreshToken={listToken}
              active={active}
              scroller="panel"
              restore={restoreSeq.current === listSeq ? restore.list : undefined}
              positionRef={positionRef}
              onClose={closeList}
              onNotAvailable={onNotAvailable}
              onRefreshResult={onListResult}
              onRestored={onRestored}
              className={PANEL_CLASS}
            >
              {({ files, moreMayFollow }) => (
                <SectionedGrids
                  sections={sections}
                  files={files}
                  moreMayFollow={moreMayFollow}
                  onRefresh={refresh}
                />
              )}
            </PhotoList>
          )}
          {listError !== null && (
            <div className={`${PANEL_CLASS} overflow-y-auto`}>
              <div className="flex justify-end pb-3">
                <Button size="sm" onClick={closeList}>
                  <X size={14} aria-hidden="true" />
                  {t("close")}
                </Button>
              </div>
              <LoadError onRetry={listError.retry} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
