import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useWide } from "./useWide";

function Probe() {
  const { ref, wide } = useWide<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-wide={wide} />;
}

function measuredAt(width: number, rootFontPx = 16) {
  document.documentElement.style.fontSize = `${rootFontPx}px`;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.fontSize = "";
});

describe("useWide", () => {
  it.each([
    [767, 16, "false"],
    [768, 16, "true"],
    [768, 20, "false"],
    [960, 20, "true"],
  ])("an element %ipx wide under a %ipx root is wide: %s", (width, root, expected) => {
    measuredAt(width, root);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe")).toHaveAttribute("data-wide", expected);
  });

  it("follows the element as it is resized", async () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    measuredAt(500);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe")).toHaveAttribute("data-wide", "false");
    measuredAt(900);
    await act(async () => notify());
    expect(getByTestId("probe")).toHaveAttribute("data-wide", "true");
  });
});
