"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { AppTheme } from "./themes";
import { MODAL_OPENED_EVENT } from "./ModalShell";

const EDGE_MARGIN = 8;
const GAP = 6;

function isHoverCapable(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Props a trigger spreads onto itself. The ref is a callback so it fits any element type. */
type TriggerProps = {
  ref: (el: HTMLElement | null) => void;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
};

/**
 * How assistive tech hears the label: as the trigger's description (the default, for text
 * that adds to its name), as its name (for a trigger with none of its own, like a decorative
 * sprite), or not at all (when its name already says the same thing).
 */
type Announce = "description" | "name" | "none";

/**
 * The bubble both trigger kinds share, and the hook a component calls to make one of its
 * own controls the trigger: spread `triggerProps` onto it and render `layer` beside it.
 * Shows on hover (fine pointers), on keyboard focus, or while `tapOpen` is set by a
 * Toggletip tap. Closes on Escape, scroll, an outside press, or any ModalShell opening (its
 * showModal() turns the trigger inert mid-interaction).
 *
 * The bubble portals to document.body (position: fixed) so `overflow` ancestors can't clip
 * it, or into the trigger's open <dialog>, whose top layer would otherwise cover it. It is
 * aria-hidden: assistive tech gets the same text from a hidden element the trigger
 * references, which exists before the bubble does, so it's announced on focus.
 */
export function useTooltip(label: ReactNode, theme: AppTheme, announce: Announce = "description") {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const labelId = useId();
  const open = hoverOpen || focusOpen || tapOpen;

  const setTrigger = useCallback((el: HTMLElement | null) => { triggerRef.current = el; }, []);
  const closeAll = useCallback(() => {
    setHoverOpen(false);
    setFocusOpen(false);
    setTapOpen(false);
  }, []);

  // Measured by whichever handler opens the bubble. Anchored by `bottom`, so the first
  // paint lands right without knowing the bubble's own height.
  function measure() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + GAP });
    setPortalTarget(trigger.closest("dialog"));
  }

  // Horizontal viewport clamp, which needs the mounted bubble's width, written straight to
  // the element so it costs no second render.
  const clampBubble = (bubble: HTMLDivElement | null) => {
    if (!bubble || !pos) return;
    const half = bubble.offsetWidth / 2;
    let shift = 0;
    if (pos.left - half < EDGE_MARGIN) shift = EDGE_MARGIN - (pos.left - half);
    else if (pos.left + half > window.innerWidth - EDGE_MARGIN) shift = window.innerWidth - EDGE_MARGIN - (pos.left + half);
    bubble.style.transform = `translateX(calc(-50% + ${shift}px))`;
  };

  // Position is measured once per open, so a scroll would detach the bubble: close instead.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("scroll", closeAll, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(MODAL_OPENED_EVENT, closeAll);
    return () => {
      window.removeEventListener("scroll", closeAll, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(MODAL_OPENED_EVENT, closeAll);
    };
  }, [open, closeAll]);

  useEffect(() => {
    if (!tapOpen) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setTapOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [tapOpen]);

  const triggerProps: TriggerProps = {
    ref: setTrigger,
    "aria-describedby": announce === "description" ? labelId : undefined,
    "aria-labelledby": announce === "name" ? labelId : undefined,
    onMouseEnter: () => {
      if (!isHoverCapable()) return;
      measure();
      setHoverOpen(true);
    },
    onMouseLeave: () => { if (isHoverCapable()) setHoverOpen(false); },
    onFocus: (e) => {
      if (!e.currentTarget.matches(":focus-visible")) return;
      measure();
      setFocusOpen(true);
    },
    onBlur: () => setFocusOpen(false),
  };

  const layer = (
    <>
      {announce !== "none" && <span id={labelId} hidden>{label}</span>}
      {open && pos && createPortal(
        <div
          ref={clampBubble}
          aria-hidden="true"
          className="hover-tip-bubble"
          style={{
            left: pos.left,
            bottom: pos.bottom,
            transform: "translateX(-50%)",
            background: theme.panel,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        >
          {label}
        </div>,
        portalTarget ?? document.body,
      )}
    </>
  );

  // Touch has no hover, so a tap is the only way to reveal a Toggletip's bubble.
  const toggleOnTap = () => {
    if (isHoverCapable()) return;
    if (!tapOpen) measure();
    setTapOpen(!tapOpen);
  };

  return { triggerProps, layer, toggleOnTap };
}

/**
 * Tooltip for a control that already exists: spread the props onto that control and it
 * becomes the trigger. Its own click does its own thing, so there's no tap toggle. Pass
 * `announce="none"` when the control's accessible name already says the same thing, so
 * screen readers don't hear it twice.
 *
 *   <Tooltip theme={theme} label="Copy preset">
 *     {(tip) => <button type="button" {...tip} onClick={copy}>…</button>}
 *   </Tooltip>
 */
export function Tooltip({ label, theme, announce = "description", children }: {
  label: ReactNode;
  theme: AppTheme;
  announce?: Announce;
  children: (triggerProps: TriggerProps) => ReactNode;
}) {
  const { triggerProps, layer } = useTooltip(label, theme, announce);
  return (
    <>
      {children(triggerProps)}
      {layer}
    </>
  );
}

const toggletipStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "inherit",
};

/**
 * Tooltip for content that isn't a control (an icon, a glyph, a status row): wraps it in
 * a real <button> so it's reachable by keyboard and tappable on touch. The content's own
 * text or alt is the button's name; use `announce="name"` when the content has none (a
 * decorative sprite), so the label names it instead. Never nest one inside another
 * control; give that control a Tooltip instead.
 */
export function Toggletip({ label, theme, announce = "description", className, style, children }: {
  label: ReactNode;
  theme: AppTheme;
  announce?: Announce;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { triggerProps, layer, toggleOnTap } = useTooltip(label, theme, announce);
  return (
    <button
      type="button"
      {...triggerProps}
      onClick={toggleOnTap}
      className={className ? `hover-tip ${className}` : "hover-tip"}
      style={{ ...toggletipStyle, ...style }}
    >
      {children}
      {layer}
    </button>
  );
}
