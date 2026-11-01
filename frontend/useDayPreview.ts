"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhotos } from "./api";

const REST_MS = 120;

export type Anchor = { left: number; top: number; width: number; height: number };
export type PreviewView = { date: string; id: string; anchor: Anchor; loaded: boolean };

export type DayPreview = {
  view: PreviewView | null;
  enter: (date: string, count: number, element: HTMLElement) => void;
  /** The pointer left the day, or the day was pressed. */
  end: () => void;
  imageLoaded: () => void;
  imageFailed: () => void;
};

type Options = {
  drive: string;
  /** Whether the calendar view is on screen. */
  active: boolean;
  /** The month the grid draws; another month ends the preview. */
  month: string | null;
  /** Changes with every read of the month's days, which drops the held answers. */
  version: unknown;
};

/**
 * A day's first photo, shown after the pointer rests on the day. A device that
 * cannot hover never reads: the list the day opens holds the same photo.
 */
export function useDayPreview({ drive, active, month, version }: Options): DayPreview {
  const [view, setView] = useState<PreviewView | null>(null);
  const held = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every start and every end moves it on, so an answer for a day the
  // pointer has left finds a number that is no longer current.
  const turn = useRef(0);
  const current = useRef<PreviewView | null>(null);
  current.current = view;

  const end = useCallback(() => {
    turn.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setView(null);
  }, []);

  const enter = useCallback(
    (date: string, count: number, element: HTMLElement) => {
      end();
      if (count <= 0 || !window.matchMedia?.("(hover: hover)").matches) return;
      const mine = turn.current;
      const show = (id: string) => {
        const box = element.getBoundingClientRect();
        setView({
          date,
          id,
          anchor: { left: box.left, top: box.top, width: box.width, height: box.height },
          loaded: false,
        });
      };
      timer.current = setTimeout(() => {
        timer.current = null;
        const id = held.current.get(date);
        if (id !== undefined) {
          show(id);
          return;
        }
        fetchPhotos(drive, { date, limit: 1 }).then(
          (result) => {
            if (mine !== turn.current) return;
            const first = result.file_ids[0];
            if (first === undefined) return;
            held.current.set(date, first);
            show(first);
          },
          () => {},
        );
      }, REST_MS);
    },
    [drive, end],
  );

  const imageLoaded = useCallback(() => {
    setView((now) => (now ? { ...now, loaded: true } : now));
  }, []);
  const imageFailed = useCallback(() => {
    const now = current.current;
    if (now && held.current.get(now.date) === now.id) held.current.delete(now.date);
    end();
  }, [end]);

  useEffect(() => {
    held.current.clear();
  }, [version, drive]);
  useEffect(() => end(), [month, active, end]);
  useEffect(() => {
    window.addEventListener("scroll", end, { passive: true });
    return () => {
      window.removeEventListener("scroll", end);
      end();
    };
  }, [end]);

  return { view, enter, end, imageLoaded, imageFailed };
}
