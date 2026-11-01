// Stands in for next/navigation: a router over the History API. Like Next's,
// it commits a navigation in a transition, so passive effects run after the new
// view is already on screen and a frame can fall between the two.
import { startTransition, useEffect, useMemo, useState } from "react";

type Location = { search: string; pathname: string };
const listeners = new Set<(location: Location) => void>();
const read = (): Location => ({ search: window.location.search, pathname: window.location.pathname });
const notify = () => startTransition(() => listeners.forEach((listener) => listener(read())));
window.addEventListener("popstate", () => notify());

function useLocation(): Location {
  const [location, setLocation] = useState<Location>(read);
  useEffect(() => {
    listeners.add(setLocation);
    setLocation(read());
    return () => {
      listeners.delete(setLocation);
    };
  }, []);
  return location;
}

export const navigate = (mode: "push" | "replace", href: string) => {
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
  notify();
};

export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname() {
  return useLocation().pathname;
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
