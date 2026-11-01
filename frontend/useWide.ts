"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

const WIDE_REM = 48;

/**
 * Whether the element is at least 48rem wide, measured on the element itself.
 * Not a container query: a containment context captures the `position: fixed`
 * context menu that the file grid draws inside it.
 */
export function useWide<T extends HTMLElement>() {
  const [wide, setWide] = useState(false);
  const node = useRef<T | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const element = node.current;
    if (!element) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    setWide(element.getBoundingClientRect().width >= WIDE_REM * rem);
  }, []);

  const ref = useCallback(
    (element: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      node.current = element;
      if (element) {
        observer.current = new ResizeObserver(measure);
        observer.current.observe(element);
      }
    },
    [measure],
  );

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  return { ref, wide };
}
