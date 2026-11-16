import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInView } from "./useInView";

function Probe() {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe">
      {seen ? "見えた" : "まだ"}
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("useInView", () => {
  it("IntersectionObserverが使えない環境では、最初から見えた扱いにする", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("見えた");
  });
  it("画面に入るまでは「まだ」、入ったら「見えた」になり、その後は戻らない", () => {
    let callback!: (e: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof callback) {
          callback = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("まだ");
    act(() => callback([{ isIntersecting: false }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("まだ");
    act(() => callback([{ isIntersecting: true }]));
    expect(screen.getByTestId("probe")).toHaveTextContent("見えた");
    expect(disconnect).toHaveBeenCalled();
  });
});
