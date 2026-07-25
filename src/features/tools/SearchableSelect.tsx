"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AppTheme } from "../../components/themes";
import { dropdownShadow } from "./shared-styles";

/** One labelled group of rows. Pass a single section with an empty `label` for a flat list. */
export interface SelectSection<T> {
  id: string;
  label: string;
  items: T[];
}

/**
 * Searchable dropdown over grouped rows, shared by the tools that need one.
 *
 * Owns the combobox contract so each caller doesn't re-derive it: arrow keys walk the
 * flattened list in the order it reads, Enter picks, Escape and Tab close, and
 * `aria-activedescendant` tracks the highlight so the input keeps focus throughout.
 * Callers own filtering and row content; everything else is here.
 */
export function SearchableSelect<T>({
  theme,
  sections,
  selectedLabel,
  getKey,
  renderRow,
  onSelect,
  ariaLabel,
  placeholder,
  inputStyle,
  triggerHeight,
  leading,
  menuMaxHeight = 320,
  emptyLabel = "No matches",
  search,
  onSearchChange,
}: {
  theme: AppTheme;
  /** Groups in display order. Sections with no items should be filtered out by the caller. */
  sections: SelectSection<T>[];
  /** Resting text for the input when the menu is closed. */
  selectedLabel: string | null;
  getKey: (item: T) => string;
  renderRow: (item: T, active: boolean) => ReactNode;
  onSelect: (item: T) => void;
  ariaLabel: string;
  placeholder: string;
  inputStyle: CSSProperties;
  triggerHeight?: number;
  /** Rendered left of the input while closed, e.g. the selected item's icon. */
  leading?: ReactNode;
  menuMaxHeight?: number;
  emptyLabel?: string;
  search: string;
  onSearchChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /** Flattened rows plus each section's starting offset, so the arrow keys and the
   *  rendered order can never disagree. */
  const { rows, offsets } = useMemo(() => {
    const flat: T[] = [];
    const starts: number[] = [];
    for (const section of sections) {
      starts.push(flat.length);
      flat.push(...section.items);
    }
    return { rows: flat, offsets: starts };
  }, [sections]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Keeps the arrow-key highlight inside the scroll viewport. No state, so no re-render.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (item: T) => {
    onSelect(item);
    onSearchChange("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setActiveIndex(0);
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + rows.length) % rows.length);
      return;
    }
    if (e.key === "Enter" && open && rows[activeIndex]) {
      e.preventDefault();
      choose(rows[activeIndex]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Tab") setOpen(false);
  };

  const menuStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    maxHeight: menuMaxHeight,
    overflowY: "auto",
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    zIndex: 10,
    marginTop: 4,
    boxShadow: dropdownShadow(theme),
  };

  const rowStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 12px",
    border: "none",
    borderRadius: 6,
    textAlign: "left",
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 600,
    background: active ? theme.accentSoft : "transparent",
    color: active ? theme.accentText : theme.text,
  });

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        className="tool-input searchable-select-trigger"
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          boxSizing: "border-box",
          cursor: "pointer",
          ...(triggerHeight ? { height: triggerHeight } : {}),
        }}
      >
        {!open && leading}
        <input
          type="text"
          className="searchable-select-input"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          value={open ? search : selectedLabel ?? ""}
          placeholder={placeholder}
          onFocus={() => {
            onSearchChange("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            border: "none",
            background: "transparent",
            color: theme.text,
            outline: "none",
            width: "100%",
            minWidth: 0,
            padding: 0,
            cursor: "inherit",
          }}
        />
        <span
          aria-hidden="true"
          style={{ marginLeft: "auto", fontSize: "0.75rem", color: theme.muted, flexShrink: 0, pointerEvents: "none" }}
        >
          ▼
        </span>
      </div>

      {open && (
        <div ref={menuRef} id={listId} role="listbox" aria-label={ariaLabel} style={menuStyle}>
          {rows.length === 0 && (
            <div style={{ padding: 12, fontSize: "0.82rem", color: theme.muted, textAlign: "center" }}>
              {emptyLabel}
            </div>
          )}
          {sections.map((section, sectionIndex) => (
            <div key={section.id}>
              {section.label && (
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: theme.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {section.label}
                </div>
              )}
              {section.items.map((item, indexInSection) => {
                const index = offsets[sectionIndex] + indexInSection;
                const active = index === activeIndex;
                return (
                  <button
                    key={getKey(item)}
                    type="button"
                    role="option"
                    id={`${listId}-${index}`}
                    aria-selected={active}
                    data-active={active}
                    tabIndex={-1}
                    // Keeps focus (and the combobox's activedescendant) on the input through the click.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(item)}
                    style={rowStyle(active)}
                  >
                    {renderRow(item, active)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
