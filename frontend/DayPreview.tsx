"use client";

import { createPortal } from "react-dom";
import type { PreviewView } from "./useDayPreview";

const WIDTH = 176;
const HEIGHT = 132;
const GAP = 8;

function place(anchor: PreviewView["anchor"]) {
  const clamp = (value: number, max: number) => Math.max(GAP, Math.min(value, max - GAP));
  const centred = anchor.left + anchor.width / 2 - WIDTH / 2;
  const above = anchor.top - GAP - HEIGHT;
  const top = above >= GAP ? above : anchor.top + anchor.height + GAP;
  return {
    left: clamp(centred, window.innerWidth - WIDTH),
    top: clamp(top, window.innerHeight - HEIGHT),
  };
}

type Props = { view: PreviewView; onLoad: () => void; onError: () => void };

/** Decorative: the list a day opens holds the same photo. */
export function DayPreviewImage({ view, onLoad, onError }: Props) {
  const { left, top } = place(view.anchor);
  return createPortal(
    <div
      aria-hidden="true"
      style={{ left, top, width: WIDTH, height: HEIGHT }}
      className={`pointer-events-none fixed z-30 overflow-hidden rounded-xl border-[3px] border-bg-card bg-sand shadow-card ${
        view.loaded ? "" : "opacity-0"
      }`}
    >
      <img
        key={view.id}
        src={`/api/files/${encodeURIComponent(view.id)}/thumbnail`}
        alt=""
        onLoad={onLoad}
        onError={onError}
        className="h-full w-full object-cover"
      />
    </div>,
    document.body,
  );
}
