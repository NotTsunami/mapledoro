/*
  Single source of truth for top-nav links.
  Edit this file when adding/removing/reordering main navigation entries.
*/
import type { Route } from "next";

export interface NavLinkItem {
  label: string;
  href: Route;
}

export const NAV_LINKS: NavLinkItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Characters", href: "/characters" },
  { label: "Tools", href: "/tools" },
  { label: "Games", href: "/games" },
  { label: "Guides", href: "/guides" },
  { label: "Settings", href: "/settings" },
];
