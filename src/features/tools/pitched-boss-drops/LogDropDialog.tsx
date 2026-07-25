"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import ModalShell from "../../../components/ModalShell";
import type { AppTheme } from "../../../components/themes";
import type { StoredCharacterRecord } from "../../characters/model/charactersStore";
import { CharacterPickerRow } from "../CharacterPickerRow";
import { localDateStr } from "../date";
import { toolStyles } from "../tool-styles";
import { ItemIcon } from "./pitched-boss-ui";
import {
  DROP_CATEGORIES,
  DROP_ITEMS,
  DROP_ITEMS_BY_ID,
  categoryLabel,
  type DropItem,
} from "./pitched-items";
import { SearchableSelect } from "../SearchableSelect";

export interface LogDropPayload {
  characterName: string;
  itemId: string;
  channel: number;
  date: string;
  note: string;
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

function fieldStyle(theme: AppTheme): CSSProperties {
  // Shared input colors + context sizing; static settings come from `.tool-input`.
  return {
    ...toolStyles(theme).inputStyle,
    width: "100%",
    height: 38,
    boxSizing: "border-box",
  };
}

function labelStyle(theme: AppTheme): CSSProperties {
  return { color: theme.muted };
}

/* ------------------------------------------------------------------ */
/*  Character picker (card list, shared with Boss Crystals dialog)     */
/* ------------------------------------------------------------------ */

function CharacterPicker({
  theme,
  characters,
  value,
  onChange,
}: {
  theme: AppTheme;
  characters: StoredCharacterRecord[];
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div
      className="pbd-char-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        maxHeight: 340,
        overflowY: "auto",
      }}
    >
      {characters.map((c) => (
        <CharacterPickerRow
          key={c.characterName}
          theme={theme}
          character={c}
          selected={value === c.characterName}
          onSelect={() => onChange(c.characterName)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grouped, searchable item picker                                    */
/* ------------------------------------------------------------------ */

function ItemPicker({
  theme,
  value,
  onChange,
}: {
  theme: AppTheme;
  value: string;
  onChange: (itemId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? DROP_ITEMS.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            categoryLabel(item.category).toLowerCase().includes(q),
        )
      : DROP_ITEMS;
    const groups = new Map<string, DropItem[]>();
    for (const item of matches) {
      const arr = groups.get(item.category) ?? [];
      arr.push(item);
      groups.set(item.category, arr);
    }
    return DROP_CATEGORIES.flatMap((cat) => {
      const items = groups.get(cat.id);
      return items && items.length > 0 ? [{ id: cat.id, label: cat.label, items }] : [];
    });
  }, [search]);

  const selected = value ? DROP_ITEMS_BY_ID.get(value) ?? null : null;

  return (
    <SearchableSelect
      theme={theme}
      sections={sections}
      selectedLabel={selected?.name ?? null}
      getKey={(item) => item.id}
      onSelect={(item) => onChange(item.id)}
      ariaLabel="Item dropped"
      placeholder="Search items..."
      inputStyle={fieldStyle(theme)}
      menuMaxHeight={260}
      emptyLabel="No items found"
      search={search}
      onSearchChange={setSearch}
      leading={selected ? <ItemIcon id={selected.itemId} /> : null}
      renderRow={(item) => (
        <>
          <ItemIcon id={item.itemId} />
          <span>{item.name}</span>
        </>
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog                                                             */
/* ------------------------------------------------------------------ */

export default function LogDropDialog({
  theme,
  characters,
  onClose,
  onSubmit,
}: {
  theme: AppTheme;
  characters: StoredCharacterRecord[];
  onClose: () => void;
  onSubmit: (payload: LogDropPayload) => void;
}) {
  const [charName, setCharName] = useState("");
  const [itemId, setItemId] = useState("");
  const [channel, setChannel] = useState("");
  const [date, setDate] = useState(localDateStr);
  const [note, setNote] = useState("");

  const styles = toolStyles(theme);

  const ready = charName !== "" && itemId !== "" && channel !== "" && date !== "";

  function handleSubmit() {
    if (!ready) return;
    onSubmit({ characterName: charName, itemId, channel: parseInt(channel, 10), date, note: note.trim() });
  }

  return (
    <ModalShell
      theme={theme}
      ariaLabel="Log a drop"
      onClose={onClose}
      style={{
        width: "min(640px, 100%)",
        maxHeight: "92vh",
        overflowY: "auto",
        padding: "1.5rem 1.5rem 1.75rem",
      }}
    >
      <style>{`
        .pbd-char-list { scrollbar-width: none; -ms-overflow-style: none; }
        .pbd-char-list::-webkit-scrollbar { width: 0; height: 0; background: transparent; }
        .pbd-char-list::-webkit-scrollbar-thumb { background: transparent; }
        @media (max-width: 560px) {
          .pbd-char-list { max-height: 176px !important; }
        }
        .pbd-option:hover { background: ${theme.accentSoft}; }
        .char-pick-row:hover { border-color: ${theme.accent} !important; }
      `}</style>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.15rem",
            color: theme.text,
            margin: "0 0 1.25rem",
          }}
        >
          Log a Drop
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem" }}>
          {/* Character column */}
          <div style={{ flex: "1 1 220px", minWidth: 220 }}>
            <span className="tool-field-label" style={labelStyle(theme)}>Character</span>
            <CharacterPicker
              theme={theme}
              characters={characters}
              value={charName}
              onChange={setCharName}
            />
          </div>

          {/* Drop details column */}
          <div style={{ flex: "1 1 260px", minWidth: 260, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <span className="tool-field-label" style={labelStyle(theme)}>Item Dropped</span>
              <ItemPicker theme={theme} value={itemId} onChange={setItemId} />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <label style={{ flex: "0 0 90px" }}>
                <span className="tool-field-label" style={labelStyle(theme)}>Channel</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={channel}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="1"
                  className="tool-input"
                  style={fieldStyle(theme)}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="tool-field-label" style={labelStyle(theme)}>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="tool-input"
                  style={fieldStyle(theme)}
                />
              </label>
            </div>

            <label>
              <span className="tool-field-label" style={labelStyle(theme)}>Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. next in line, sold for…"
                className="tool-input"
                style={fieldStyle(theme)}
              />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={onClose}
            style={styles.dialogBtnStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={handleSubmit}
            disabled={!ready}
            style={{
              ...styles.dialogPrimaryBtnStyle,
              opacity: ready ? 1 : 0.5,
              cursor: ready ? "pointer" : "not-allowed",
            }}
          >
            Add Drop
          </button>
        </div>
    </ModalShell>
  );
}
