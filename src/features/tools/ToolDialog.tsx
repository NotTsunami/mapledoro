"use client";

import { useId, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AppTheme } from "../../components/themes";
import ModalShell from "../../components/ModalShell";

function panelStyle(maxWidth: number): CSSProperties {
  return {
    maxWidth,
    width: "100%",
    maxHeight: "85vh",
    padding: "1.5rem",
  };
}

/**
 * Titled modal shared by the manually-populated trackers, built on ModalShell's native
 * <dialog> (focus trap, Escape, backdrop click, inert background). Consumers supply the
 * title, optional description, body, and footer actions; the body region flexes and
 * scrolls (wrap it in `.tool-dialog-scroll`). `initialFocusRef` names the control to
 * focus on open, such as a name input; otherwise the dialog itself takes focus.
 */
export function ToolDialog({
  theme,
  title,
  description,
  onClose,
  footer,
  children,
  maxWidth = 600,
  initialFocusRef,
}: {
  theme: AppTheme;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();

  return (
    <ModalShell
      theme={theme}
      labelledBy={titleId}
      onClose={onClose}
      initialFocusRef={initialFocusRef}
      className="tool-dialog"
      style={panelStyle(maxWidth)}
    >
      <div
        id={titleId}
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.15rem",
          color: theme.text,
          marginBottom: description ? "0.25rem" : "1rem",
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: "0.75rem", color: theme.muted, marginBottom: "1rem" }}>
          {description}
        </div>
      )}
      {children}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
        {footer}
      </div>
    </ModalShell>
  );
}
