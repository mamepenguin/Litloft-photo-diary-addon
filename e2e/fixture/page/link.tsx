// Stands in for next/link: an anchor that goes through the fixture's router.
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "./navigation";

export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        navigate("push", href);
      }}
    />
  );
}
