"use client";

/*
  Tools landing page.
  Groups tools into one panel per category, each tool a compact linked row.
*/
import type { Route } from "next";
import AppShell from "../../components/AppShell";
import { LinkRow, LinkRowPanel } from "../../components/LinkRow";
import { ItemIcon, SkillIcon } from "../../components/ResourceImage";
import type { AppTheme } from "../../components/themes";

type ToolCard = {
  title: string;
  description: string;
  href: Route;
  comingSoon?: boolean;
} & (
  | { iconType?: "emoji"; icon: string }
  | { iconType: "item"; itemId: string }
  | { iconType: "skill"; skillId: string }
);

const CALCULATORS: ToolCard[] = [
  {
    title: "Star Force Calculator",
    description: "Expected meso and booms before a star force run.",
    icon: "⭐",
    href: "/tools/star-force",
  },
  {
    title: "Cubing Calculator",
    description: "Expected cubes and meso for the lines you want.",
    itemId: "05062028", // Glowing Cube
    iconType: "item",
    href: "/tools/cubing",
  },
  {
    title: "Flaming Calculator",
    description: "Expected flames to land the bonus stats you need.",
    itemId: "02048752", // Powerful Rebirth Flame
    iconType: "item",
    href: "/tools/flaming",
  },
  {
    title: "EXP Calculator",
    description: "Hourly farming rates, weekly EXP, and level resources.",
    itemId: "02637353", // EXP Voucher
    iconType: "item",
    href: "/tools/exp-calculator",
  },
  {
    title: "Stat Optimizer",
    description:
      "Find the optimal Hyper Stat and HEXA Stat allocation for bossing.",
    skillId: "500071000", // HEXA Stats
    iconType: "skill",
    href: "/tools/stat-optimizer",
  },
];

const PLANNERS: ToolCard[] = [
  {
    title: "Event Planner",
    description: "Total meso and spare items for your event star forcing.",
    icon: "📅",
    href: "/tools/event-planner",
  },
  {
    title: "Mystic Frontier Solver",
    description: "Whether your roll clears the target, and which would.",
    itemId: "03802172", // Blessed Orange Dice
    iconType: "item",
    href: "/tools/mystic-frontier",
  },
];

const TRACKERS: ToolCard[] = [
  {
    title: "Boss Crystal Tracker",
    description: "Weekly crystal income across your whole roster.",
    itemId: "04001928", // Intense Power Crystal (Weekly)
    iconType: "item",
    href: "/tools/boss-crystals",
  },
  {
    title: "Daily Tracker",
    description: "One checklist for every daily, on every character.",
    itemId: "04001886", // Intense Power Crystal (Daily)
    iconType: "item",
    href: "/tools/dailies",
  },
  {
    title: "Liberation Tracker",
    description: "Genesis, Destiny, and Astra progress with a finish date.",
    itemId: "01332303", // Destiny Dagger
    iconType: "item",
    href: "/tools/liberation",
  },
  {
    title: "Symbol Tracker",
    description: "Days to max for every Arcane and Sacred symbol.",
    itemId: "01713000", // Sacred Symbol: Cernium
    iconType: "item",
    href: "/tools/symbols",
  },
  {
    title: "HEXA Skill Tracker",
    description: "Sol Erda and Fragment cost to max your HEXA skills.",
    itemId: "04009613", // Sol Erda Fragment
    iconType: "item",
    href: "/tools/hexa-skills",
  },
  {
    title: "Drop Tracker",
    description: "Your rare boss drop history, charted by item and month.",
    itemId: "02539004", // Grindstone of Faith
    iconType: "item",
    href: "/tools/drop-tracker",
  },
  {
    title: "Trace Restoration Tracker",
    description: "Whisper crystal and mission progress toward your item.",
    itemId: "04001956", // Pitched Whisper Crystal
    iconType: "item",
    href: "/tools/trace-restoration",
  },
];

const SECTIONS: { label: string; tools: ToolCard[] }[] = [
  { label: "Calculators", tools: CALCULATORS },
  { label: "Trackers", tools: TRACKERS },
  { label: "Planners & Solvers", tools: PLANNERS },
];

function toolIcon(tool: ToolCard) {
  if (tool.iconType === "item") return <ItemIcon id={tool.itemId} size={26} />;
  if (tool.iconType === "skill") return <SkillIcon id={tool.skillId} size={26} />;
  return tool.icon;
}

function ToolsContent({ theme }: { theme: AppTheme }) {
  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Tools
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          MapleStory calculators, trackers, and planners
        </div>

        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {SECTIONS.map((section) => (
            <LinkRowPanel key={section.label} label={section.label} theme={theme}>
              {section.tools.map((tool) => (
                <LinkRow
                  key={tool.title}
                  href={tool.href}
                  icon={toolIcon(tool)}
                  title={tool.title}
                  description={tool.description}
                  disabled={tool.comingSoon}
                  badge={
                    tool.comingSoon && (
                      <span className="tool-badge" style={{ background: theme.badge, color: theme.badgeText }}>
                        Soon
                      </span>
                    )
                  }
                  theme={theme}
                />
              ))}
            </LinkRowPanel>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ToolsPage() {
  return (
    <AppShell currentPath="/tools">
      {({ theme }) => <ToolsContent theme={theme} />}
    </AppShell>
  );
}
