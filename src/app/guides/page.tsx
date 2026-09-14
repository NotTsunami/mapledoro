"use client";

/*
  Guides landing page.
  Displays guides as compact linked rows inside a category panel.
*/
import type { Route } from "next";
import AppShell from "../../components/AppShell";
import { LinkRow, LinkRowPanel } from "../../components/LinkRow";
import type { AppTheme } from "../../components/themes";

interface GuideCard {
  title: string;
  description: string;
  emoji: string;
  href: Route;
}

const GUIDES: GuideCard[] = [
  {
    title: "New Player Guide",
    description: "An interactive guide that adapts to your world and character.",
    emoji: "🌱",
    href: "/guides/new-players",
  },
  {
    title: "Character Guides",
    description: "Every class with link skills and legion bonuses.",
    emoji: "⚔️",
    href: "/guides/character-guides",
  },
];

function GuidesContent({ theme }: { theme: AppTheme }) {
  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Guides
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          MapleStory guides and resources
        </div>

        <div className="fade-in">
          <LinkRowPanel label="Guides" theme={theme}>
            {GUIDES.map((guide) => (
              <LinkRow
                key={guide.href}
                href={guide.href}
                icon={guide.emoji}
                title={guide.title}
                description={guide.description}
                theme={theme}
              />
            ))}
          </LinkRowPanel>
        </div>
      </div>
    </div>
  );
}

export default function GuidesPage() {
  return (
    <AppShell currentPath="/guides">
      {({ theme }) => <GuidesContent theme={theme} />}
    </AppShell>
  );
}
