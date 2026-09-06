"use client";

import type { CSSProperties } from "react";
import type { AppTheme } from "../../../../components/themes";

// Shared by every "editable node list" section (V Matrix, HEXA Matrix, the Scouter
// Simulator's HEXA tab) -- a label, optionally with Clear/Max All controls above a divider.
// onMaxAll/onClear/btnStyle are all optional since HexaMatrixSetupStep also uses this as a
// bare section header (Main Stat/Alternative Stats) with no controls at all. The button style
// is passed in rather than baked in here: V Matrix/HEXA Matrix's own sectionBtnStyle expands
// the click target via negative-margin padding, which the Simulator's tighter flex layout
// can't use without visually compressing its tiles (see hexaSectionBtnStyle's own comment),
// so each caller keeps its own tuned style.
export default function SectionLabel({ theme, label, onMaxAll, onClear, btnStyle }: {
  theme: AppTheme;
  label: string;
  onMaxAll?: () => void;
  onClear?: () => void;
  /** Base button style (background/border/font/padding/margin, no color) -- theme.muted/
   *  theme.accent are applied per-button on top of this. Required whenever onMaxAll/onClear
   *  is passed. */
  btnStyle?: CSSProperties;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      marginBottom: "0.45rem", paddingBottom: "0.25rem", borderBottom: `1px solid ${theme.border}`,
    }}>
      <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 800, color: theme.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </p>
      {(onMaxAll || onClear) && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {onClear && <button type="button" onClick={onClear} style={{ ...btnStyle, color: theme.muted }}>Clear</button>}
          {onClear && onMaxAll && <span style={{ width: 1, alignSelf: "stretch", background: theme.border, flexShrink: 0 }} />}
          {onMaxAll && <button type="button" onClick={onMaxAll} style={{ ...btnStyle, color: theme.accent }}>Max All</button>}
        </div>
      )}
    </div>
  );
}
