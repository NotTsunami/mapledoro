"use client";

import type { CSSProperties } from "react";
import type { AppTheme } from "./themes";
import { resourceImageUrl } from "../lib/mapleResource";

// Familiar portrait shared by the character setup flow (picker rows, slot cards, read-only
// profile cards) and Mystic Frontier (lineup slots, picker rows). Walks mob sprite, then own-id
// familiar sprite, then card icon, then a name-initial placeholder, one request at a time: a
// single raw <img> advances its `src` on error via a `dataset.step` counter (per CLAUDE.md image
// policy: swap on error, no re-render or state), so a spriteless familiar settles on its card
// icon or the placeholder instead of re-fetching a broken URL forever.
//
// `mobId` is the sprite id: callers pass the entry's `spriteMobId ?? mobId`. "familiar" sprites
// are keyed by the familiar's own id, not mobId. These are the direct-sprite familiars
// (spriteFrom: "familiar") with no real monster to borrow a mob sprite from.

export function FamiliarCardSprite({ mobId, familiarId, cardId, name, size, theme, fill }: { mobId: string; familiarId: number | null; cardId: string; name: string; size: number; theme: AppTheme; fill?: boolean }) {
  const sources = [
    resourceImageUrl("mob", mobId, "sprite.png"),
    ...(familiarId !== null ? [resourceImageUrl("familiar", String(familiarId), "sprite.png")] : []),
    ...(cardId ? [resourceImageUrl("item", cardId, "icon.png")] : []),
  ];
  // `fill` sizes the sprite off its flex-grown container instead of a fixed px square. The
  // read-only profile card uses it so the sprite expands into whatever vertical space the
  // card has left over, rather than sitting at a fixed size with dead space around it.
  const dims: CSSProperties = fill ? { width: "100%", height: "100%" } : { width: size, height: size };
  return (
    <span style={{ ...dims, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}{/* react-doctor-disable-next-line nextjs-no-img-element -- needs a sequential onError fallback chain (mob -> familiar -> card) that next/image's declarative API can't express */}
      <img
        key={`${mobId}/${familiarId}/${cardId}`}
        src={sources[0]}
        alt=""
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        // Pickers list up to 50 familiars with roughly a viewport's worth on screen, so
        // without this every row fetches a sprite the moment the dropdown opens. The
        // onError fallback chain below still runs normally for whichever ones load.
        loading="lazy"
        decoding="async"
        style={{ objectFit: "contain", ...dims, display: "block" }}
        onError={(e) => {
          const img = e.currentTarget;
          const next = Number(img.dataset.step ?? "0") + 1;
          if (next < sources.length) {
            img.dataset.step = String(next);
            img.src = sources[next];
          } else {
            img.style.display = "none";
            const ph = img.nextElementSibling as HTMLElement | null;
            if (ph) ph.style.display = "flex";
          }
        }}
      />
      <span aria-hidden style={{
        display: "none", alignItems: "center", justifyContent: "center", ...dims,
        borderRadius: 6, fontWeight: 800, fontSize: Math.max(12, size * 0.35),
        background: "rgba(127,127,127,0.18)", color: theme.muted,
      }}>
        {name.match(/[a-zA-Z0-9]/)?.[0] ?? "?"}
      </span>
    </span>
  );
}
