// Stands in for next/navigation: a router over the History API.
import { useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
};

export const navigate = (mode: "push" | "replace", href: string) => {
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
  notify();
};

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string) => navigate("push", href),
      replace: (href: string) => navigate("replace", href),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => {},
      prefetch: () => {},
    }),
    [],
  );
}
