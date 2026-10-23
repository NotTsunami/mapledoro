"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AppTheme } from "./themes";

/** Fired on `window` every time a ModalShell-based dialog opens -- see Tooltip.tsx,
 *  which listens for this to force-close a bubble stuck open by its own trigger. */
export const MODAL_OPENED_EVENT = "mapledoro:modal-opened";

/** Native <dialog>-based modal shell: opens via showModal() on mount, so focus
 *  trapping and Escape come for free; closes on backdrop click or cancel.
 *  Width, padding, and scroll behavior come from `style`; layout CSS that must
 *  wait for the open state can target the consumer `className` scoped to
 *  `[open]` (the dialog stays display:none until showModal() runs). */
export default function ModalShell({
  theme,
  ariaLabel,
  labelledBy,
  onClose,
  initialFocusRef,
  className,
  style,
  children,
}: {
  theme: AppTheme;
  /** Pass one: a literal name, or the id of a visible title. */
  ariaLabel?: string;
  labelledBy?: string;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Mounted fresh per session, so open once on mount.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    // Unmounting removes the dialog rather than close()-ing it, which skips the
    // browser's own focus restore, so hand focus back to the opener here.
    // A ref, set only when showModal() runs, so StrictMode's second mount pass
    // (dialog already open, focus inside it) keeps the real opener.
    if (!dlg.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dlg.showModal();
    }
    // showModal() makes everything behind this dialog inert, so a tooltip whose trigger
    // opened this same dialog stops receiving the mouse/focus events it'd normally rely on to
    // close itself, leaving its bubble stuck floating over the modal. Broadcasting this lets
    // tooltips force-close on any modal open without ModalShell needing to know it exists.
    window.dispatchEvent(new Event(MODAL_OPENED_EVENT));
    // showModal() focuses the first focusable descendant, which paints a focus
    // ring on whatever control happens to be first (a character row, a Cancel
    // button) as if the user had tabbed to it. Focus the dialog itself instead:
    // the accessible name is still announced and Tab still walks the contents.
    // A consumer can name a control to start on instead, such as a name input.
    (initialFocusRef?.current ?? dlg).focus();
    return () => openerRef.current?.focus();
  }, [initialFocusRef]);

  // Backdrop click-to-close is a pointer-only convenience (keyboard users
  // dismiss via Escape/cancel), so it lives here as a native listener rather
  // than an interactive handler on the non-interactive <dialog> element.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    const onBackdropClick = (e: MouseEvent) => {
      if (e.target === dlg) onClose();
    };
    dlg.addEventListener("click", onBackdropClick);
    return () => dlg.removeEventListener("click", onBackdropClick);
  }, [onClose]);

  // showModal() blocks interaction behind the dialog but not scrolling, so the
  // page still slides around under it (worst on touch, where the modal reads as
  // a sheet). Pinning the body is the one lock iOS Safari honors; it needs the
  // scroll offset carried across and restored, since a fixed body sits at 0.
  // `html { overflow-y: scroll }` keeps the desktop scrollbar gutter, so
  // nothing shifts sideways while it's held.
  useEffect(() => {
    const { body } = document;
    const scrollY = window.scrollY;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const baseStyle: CSSProperties = {
    padding: 0,
    background: theme.panel,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,0.24)",
    // Scrolling past the end of a scrollable dialog shouldn't hand the gesture
    // to whatever is behind it.
    overscrollBehavior: "contain",
  };

  return (
    <dialog
      ref={dialogRef}
      // Focus target for the mount effect; -1 keeps it out of the Tab order.
      tabIndex={-1}
      className={className ? `modal-shell ${className}` : "modal-shell"}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onCancel={onClose}
      style={{ ...baseStyle, ...style }}
    >
      <style>{`
        dialog.modal-shell::backdrop { background: rgba(15, 23, 42, 0.42); }
        /* The shell takes focus on open purely to keep the ring off the first
           control, so it shouldn't paint a ring of its own. */
        dialog.modal-shell:focus { outline: none; }
      `}</style>
      {children}
    </dialog>
  );
}
