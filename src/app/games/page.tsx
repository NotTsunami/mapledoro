"use client";

/*
  Games landing page.
  Displays games as compact linked rows inside a category panel.
*/
import type { Route } from "next";
import AppShell from "../../components/AppShell";
import { LinkRow, LinkRowPanel } from "../../components/LinkRow";
import type { AppTheme } from "../../components/themes";

interface GameCard {
  title: string;
  description: string;
  icon: string;
  href: Route;
}

const GAMES: GameCard[] = [
  {
    title: "Mapledle",
    description: "Guess which class learns the daily skill icon in 5 tries.",
    icon: "🎯",
    href: "/games/skill-guesser",
  },
  {
    title: "BGM Guesser",
    description: "Name the area or boss the daily MapleStory track plays for in 3 tries.",
    icon: "🎵",
    href: "/games/bgm-guesser",
  },
];

function GamesContent({ theme }: { theme: AppTheme }) {
  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Games
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          Daily MapleStory minigames
        </div>

        <div className="fade-in">
          <LinkRowPanel label="Games" theme={theme}>
            {GAMES.map((game) => (
              <LinkRow
                key={game.href}
                href={game.href}
                icon={game.icon}
                title={game.title}
                description={game.description}
                theme={theme}
              />
            ))}
          </LinkRowPanel>
        </div>
      </div>
    </div>
  );
}

export default function GamesPage() {
  return (
    <AppShell currentPath="/games">
      {({ theme }) => <GamesContent theme={theme} />}
    </AppShell>
  );
}
