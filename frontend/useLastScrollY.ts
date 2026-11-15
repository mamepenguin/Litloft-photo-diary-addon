"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The window's scroll offset as last seen while the page was mounted. Teardown
 * is too late to read it: by then the browser may already have clamped the
 * offset to a document the outgoing route has shortened, and the position
 * saved would be that clamp instead of the one the viewer left.
 */
export function useLastScrollY(): RefObject<number> {
  const lastScrollY = useRef(0);

  useLayoutEffect(() => {
    const remember = () => {
      lastScrollY.current = window.scrollY;
    };
    remember();
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  return lastScrollY;
}
