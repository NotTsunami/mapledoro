"use client";

import { useRef, useState } from "react";

/**
 * Moves one entry within a list, returning a new array. Out-of-range indices
 * return the original array so a stale drop can't corrupt the order.
 */
export function moveInArray<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const DRAG_THRESHOLD_PX = 6;
const GHOST_Z_INDEX = 9999; // above every z-index in globals.css (highest currently used is 200)

function createGhost(card: HTMLElement): HTMLElement {
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  // pointer-events: none also keeps the ghost out of elementFromPoint's hit-testing below,
  // so it never shadows the real card underneath it while picking a drop target.
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = String(GHOST_Z_INDEX);
  ghost.style.opacity = "0.9";
  ghost.style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.35)";
  ghost.style.transition = "none";
  // cloneNode copies classList too -- these cards carry the shared .fade-in entrance class
  // (globals.css), which replays its 0.5s opacity/translateY animation on any freshly-inserted
  // element that still has it, making the ghost look like it takes half a second to "arrive".
  // Inline animation: none overrides that regardless of which classes came along with the clone.
  ghost.style.animation = "none";
  ghost.style.willChange = "transform";
  // A ghost appended while an ancestor dialog is open should stay inside it (an open <dialog>
  // renders in the browser's top layer, above every z-index in the regular document) --
  // falls back to document.body for cards outside any dialog.
  const container = card.closest("dialog") ?? document.body;
  container.appendChild(ghost);
  return ghost;
}

export interface CardDragProps {
  "data-card-index": number;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  index: number;
  armed: boolean;
}

/**
 * Pointer-events drag-to-reorder for a grid/list of cards. Shared by the Boss Crystal and
 * Daily trackers, which both hold an ordered, manually-added character list. `dragProps(index)`
 * spreads onto each card; `isDragging`/`isDropTarget` drive the dimmed / accent-border states.
 *
 * Built on Pointer Events rather than the HTML5 Drag and Drop API -- `draggable` doesn't
 * fire drag gestures from touch input at all on iOS Safari (a long-press there just triggers
 * the OS's own image/link callout instead), so this needed to work via touch from the start.
 *
 * `dragProps` intentionally has no `style`/`className` -- both call sites spread it and then
 * write a literal `style={{...}}` afterward in JSX, which would silently clobber a `style` key
 * returned here (later-written props win). The `touch-action: none` this needs to claim the
 * gesture from the browser's own scroll handling instead lives in the shared
 * `.card-reorder-surface` global class -- add that class name at each call site instead.
 */
export function useCardReorder(reorder: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  // Mirrors overIndex synchronously (set alongside setOverIndex below, not read back from
  // state) so a pointerup landing before React re-renders still sees the real drop target
  // instead of a stale one from the previous render's closure.
  const overIndexRef = useRef<number | null>(null);
  // The floating drag ghost -- a raw DOM clone rather than React state so its position can
  // follow the pointer every move without waiting on a render.
  const ghostRef = useRef<HTMLElement | null>(null);

  function endGesture() {
    gestureRef.current = null;
    overIndexRef.current = null;
    ghostRef.current?.remove();
    ghostRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }

  const dragProps = (index: number): CardDragProps => ({
    "data-card-index": index,
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      gestureRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, index, armed: false };
    },
    onPointerMove: (e) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      if (!g.armed) {
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        g.armed = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        ghostRef.current = createGhost(e.currentTarget);
        setDragIndex(g.index);
      }
      e.preventDefault();
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${e.clientX - g.startX}px, ${e.clientY - g.startY}px)`;
      }
      // Pointer capture retargets subsequent events to the card that started the drag, so
      // other cards' own onPointerMove never fires -- elementFromPoint is what actually finds
      // whatever the finger/cursor is currently over.
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-card-index]");
      if (!hit) return;
      const idx = Number(hit.dataset.cardIndex);
      if (!Number.isNaN(idx) && idx !== overIndexRef.current) {
        overIndexRef.current = idx;
        setOverIndex(idx);
      }
    },
    onPointerUp: (e) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const target = overIndexRef.current;
      if (g.armed && target !== null && target !== g.index) reorder(g.index, target);
      endGesture();
    },
    onPointerCancel: () => endGesture(),
  });

  const isDragging = (index: number) => dragIndex === index;
  const isDropTarget = (index: number) =>
    overIndex === index && dragIndex !== null && dragIndex !== index;

  return { dragProps, isDragging, isDropTarget };
}
