import type { CSSProperties, ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import type { AppTheme } from "./themes";

/** Category panel on a landing page (Tools / Games / Guides): a label over a grid of `LinkRow`s. */
export function LinkRowPanel({
  label,
  theme,
  children,
}: {
  label: string;
  theme: AppTheme;
  children: ReactNode;
}) {
  const gridStyle = { "--link-row-hover": theme.accentSoft } as CSSProperties;
  return (
    <div className="panel-card" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
      <div className="panel-label" style={{ color: theme.muted }}>
        {label}
      </div>
      <div className="link-row-grid" style={gridStyle}>
        {children}
      </div>
    </div>
  );
}

/** One compact linked row: icon tile, title (plus optional badge), one-line description, hover arrow. */
export function LinkRow({
  href,
  icon,
  title,
  description,
  badge,
  disabled = false,
  theme,
}: {
  href: Route;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
  /** Render as a dimmed, non-navigating row (a tool that isn't out yet). */
  disabled?: boolean;
  theme: AppTheme;
}) {
  const inner = (
    <>
      <div className="link-row-icon" style={{ background: theme.bg }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="link-row-title" style={{ color: theme.text }}>
            {title}
          </span>
          {badge}
        </div>
        <div className="link-row-desc" style={{ color: theme.muted }}>
          {description}
        </div>
      </div>
      {!disabled && (
        <span className="link-row-arrow" style={{ color: theme.accentText }}>
          →
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className="link-row" style={{ opacity: 0.55 }}>
        {inner}
      </div>
    );
  }
  return (
    <Link href={href} className="link-row">
      {inner}
    </Link>
  );
}
