import { useEffect, useRef, useState } from "react";

/** Tracks whether a scrollable element has more content past its start/end edge, so a
 *  caller can show a directional fade only where there's actually something to scroll to
 *  -- a static CSS mask fades the trailing edge unconditionally, which misreads as "more
 *  to scroll" even when the last item is already fully in view. Re-checks on scroll,
 *  resize, and whenever `deps` changes (e.g. the row's own item count), since content
 *  can grow/shrink without the container itself resizing. `axis` defaults to
 *  "horizontal" (scrollLeft/clientWidth/scrollWidth) to match every existing caller;
 *  pass "vertical" for a scrollTop/clientHeight/scrollHeight list. */
export function useScrollEdges<T extends HTMLElement>(
  deps: readonly unknown[] = [],
  axis: "horizontal" | "vertical" = "horizontal",
): {
  ref: React.RefObject<T | null>;
  atStart: boolean;
  atEnd: boolean;
} {
  const ref = useRef<T>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      // 1px tolerance for sub-pixel rounding at the scroll boundary.
      if (axis === "vertical") {
        setAtStart(el.scrollTop <= 1);
        setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
      } else {
        setAtStart(el.scrollLeft <= 1);
        setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
      }
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axis, ...deps]);

  return { ref, atStart, atEnd };
}

/** A directional fade mask that only covers whichever edge(s) still have more content to
 *  scroll to, given useScrollEdges' own atStart/atEnd. `fadeWidth` matches the CSS px
 *  size baked into the gradient stops (28px to match the profile binder spine's existing
 *  fade width by default). `axis` must match the one passed to useScrollEdges. */
export function edgeFadeMask(
  atStart: boolean,
  atEnd: boolean,
  fadeWidth = 28,
  axis: "horizontal" | "vertical" = "horizontal",
): string {
  const stops: string[] = [];
  stops.push(atStart ? "black 0%" : `transparent 0%, black ${fadeWidth}px`);
  stops.push(atEnd ? "black 100%" : `black calc(100% - ${fadeWidth}px), transparent 100%`);
  const direction = axis === "vertical" ? "to bottom" : "to right";
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}
