"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** The app header publishes its height; a page without one scrolls from the top. */
export function appHeaderHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-header-h")) || 0;
}

/** The gap between the app header and a held column. */
export const HOLD_GAP = 16;

/**
 * Whether the column fits the viewport under the app header, so that holding
 * it there leaves every week reachable. A view that is not on screen measures
 * 0 and would always fit, so nothing is read then; the next measure is when it
 * comes back.
 */
export function useHeldColumn(active: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [fits, setFits] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const measure = useCallback(() => {
    if (!activeRef.current || !node || node.getClientRects().length === 0) return;
    setFits(node.getBoundingClientRect().height + appHeaderHeight() + HOLD_GAP <= window.innerHeight);
  }, [node]);

  useLayoutEffect(() => {
    measure();
  }, [measure, active]);

  useLayoutEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [node, measure]);

  return { ref: setNode, fits };
}

/**
 * Whether a zero-height sticky marker has reached the app header. A marker
 * that has not stuck yet sits below the header, and one that has sits exactly
 * on it, so its top alone says whether the content above it is out of sight.
 */
export function useReachedHeader(enabled: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [reached, setReached] = useState(false);

  useLayoutEffect(() => {
    if (!enabled || !node) {
      setReached(false);
      return;
    }
    // An element with no box has no position to compare, and reads as 0.
    const measure = () =>
      setReached(node.getClientRects().length > 0 && node.getBoundingClientRect().top <= appHeaderHeight() + 0.5);
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [enabled, node]);

  return { ref: setNode, reached: enabled && reached };
}
