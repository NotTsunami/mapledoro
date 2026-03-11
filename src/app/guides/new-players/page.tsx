"use client";

/*
  New Players Guide page.
  A long-form guide with text sections and images for MapleStory beginners.
*/
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AppShell from "../../../components/AppShell";
import type { AppTheme } from "../../../components/themes";

/* ── Section data ──────────────────────────────────────────────── */

interface GuideSection {
  id: string;
  title: string;
  /* image path inside /public/guides/new-players/ */
  image?: string;
  imageAlt?: string;
  body: string;
}

const SECTIONS: GuideSection[] = [
  {
    id: "welcome",
    title: "Welcome to MapleStory",
    image: undefined, // e.g. "/guides/new-players/welcome.png"
    imageAlt: "",
    body: `Welcome to MapleStory. MapleStory is a free-to-play 2D side-scrolling MMORPG that has been running since 2003. You play as a character in the Maple World, leveling from 1 all the way to the cap of 300 by fighting monsters, completing quests, and tackling increasingly difficult bosses.

The gameplay loop revolves around dailies, weekly bossing, farming, and gear progression. Each day you'll complete daily quests and bosses to earn resources and strengthen your character. Each week you'll take on harder bosses for mesos and rare drops. In between, you'll farm maps for EXP and mesos, and pour those gains into upgrading your equipment through systems like Star Force, cubing, and flaming.

In this guide, you'll learn how to get started, pick a class, understand the core systems, and begin progressing your character. Whether you're completely new or returning after a long break, this will walk you through the essentials.`,
  },
  {
    id: "choosing-class",
    title: "Choosing Your Class",
    image: undefined,
    imageAlt: "",
    body: `MapleStory has over 50 playable classes, and the best one to pick is whichever one you think looks cool. Seriously — every class can clear all content in the game, so there's no wrong choice. Watch some gameplay videos, try a few out to level 30 or so, and see which playstyle clicks with you.

Some classes are flashy and fast, others are tanky and methodical. Some have huge mobbing skills that wipe the map, others excel at bossing with high single-target damage. You don't need to commit right away either — making multiple characters is actually encouraged since they provide passive stat boosts to your whole account through the Legion system.

Can't decide? Hit the button below and let fate choose for you.`,
  },
  {
    id: "early-leveling",
    title: "Early Leveling",
    image: undefined,
    imageAlt: "",
    body: "Section content goes here.",
  },
  {
    id: "core-mechanics",
    title: "Core Mechanics",
    image: undefined,
    imageAlt: "",
    body: "Section content goes here.",
  },
  {
    id: "tips",
    title: "Useful Tips",
    image: undefined,
    imageAlt: "",
    body: "Section content goes here.",
  },
];

/* ── Class list for randomizer ─────────────────────────────────── */

const CLASSES = [
  "Hero", "Paladin", "Dark Knight",
  "Arch Mage (Fire/Poison)", "Arch Mage (Ice/Lightning)", "Bishop",
  "Bowmaster", "Marksman", "Pathfinder",
  "Night Lord", "Shadower", "Dual Blade",
  "Corsair", "Cannoneer", "Buccaneer",
  "Dawn Warrior", "Blaze Wizard", "Wind Archer",
  "Night Walker", "Thunder Breaker", "Mihile",
  "Aran", "Evan", "Mercedes", "Phantom", "Luminous", "Shade",
  "Battle Mage", "Wild Hunter", "Mechanic", "Blaster",
  "Demon Slayer", "Demon Avenger", "Xenon",
  "Kaiser", "Angelic Buster", "Cadena", "Kain",
  "Illium", "Ark", "Adele", "Khali",
  "Hoyoung", "Lara",
  "Zero", "Kinesis", "Lynn",
  "Hayato", "Kanna", "Beast Tamer",
];

function ClassRandomizer({ theme }: { theme: AppTheme }) {
  const [result, setResult] = useState<string | null>(null);

  function roll() {
    setResult(CLASSES[Math.floor(Math.random() * CLASSES.length)]);
  }

  return (
    <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
      <button
        onClick={roll}
        style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: "0.85rem",
          padding: "0.6rem 1.25rem",
          borderRadius: "12px",
          border: "none",
          background: theme.accent,
          color: "#fff",
          cursor: "pointer",
          transition: "opacity 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        Randomize my class
      </button>
      {result && (
        <div
          style={{
            fontSize: "0.9rem",
            fontWeight: 700,
            color: theme.text,
            background: theme.accentSoft,
            border: `1px solid ${theme.border}`,
            borderRadius: "10px",
            padding: "0.5rem 1rem",
          }}
        >
          You should play <span style={{ color: theme.accent }}>{result}</span>!
        </div>
      )}
    </div>
  );
}

/* ── Components ────────────────────────────────────────────────── */

function SectionCard({
  section,
  theme,
  index,
  children,
}: {
  section: GuideSection;
  theme: AppTheme;
  index: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fade-in"
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: "18px",
        padding: "2rem 1.75rem",
        animationDelay: `${index * 0.06}s`,
        animationFillMode: "both",
      }}
    >
      {/* Section heading */}
      <div
        style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: "1.15rem",
          color: theme.text,
          marginBottom: "1rem",
        }}
      >
        {section.title}
      </div>

      {/* Optional image */}
      {section.image && (
        <div
          style={{
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "1.25rem",
            border: `1px solid ${theme.border}`,
          }}
        >
          <Image
            src={section.image}
            alt={section.imageAlt || section.title}
            width={1000}
            height={500}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      )}

      {/* Body text */}
      <div
        style={{
          fontSize: "0.88rem",
          color: theme.muted,
          fontWeight: 600,
          lineHeight: 1.75,
          whiteSpace: "pre-line",
        }}
      >
        {section.body}
      </div>

      {children}
    </div>
  );
}

function NewPlayersContent({ theme }: { theme: AppTheme }) {
  return (
    <>
      <style>{`
        @media (max-width: 860px) {
          .guide-main { padding: 1rem !important; }
        }
      `}</style>

      <div
        className="guide-main"
        style={{
          flex: 1,
          width: "100%",
          padding: "1.5rem 1.5rem 2rem 2.75rem",
        }}
      >
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Back link */}
          <Link
            href="/guides"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: theme.accent,
              textDecoration: "none",
              marginBottom: "1.25rem",
            }}
          >
            ← Back to Guides
          </Link>

          {/* Page title */}
          <div
            style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: "1.5rem",
              color: theme.text,
              marginBottom: "0.25rem",
            }}
          >
            New Players Guide
          </div>
          <div
            style={{
              fontSize: "0.85rem",
              color: theme.muted,
              fontWeight: 600,
              marginBottom: "1.5rem",
            }}
          >
            Everything you need to know to get started in MapleStory
          </div>

          {/* Table of contents */}
          <div
            className="fade-in"
            style={{
              background: theme.accentSoft,
              border: `1px solid ${theme.border}`,
              borderRadius: "14px",
              padding: "1.25rem 1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontFamily: "'Fredoka One', cursive",
                fontSize: "0.9rem",
                color: theme.text,
                marginBottom: "0.75rem",
              }}
            >
              Contents
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: theme.accent,
                    textDecoration: "none",
                  }}
                >
                  {i + 1}. {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Guide sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {SECTIONS.map((section, i) => (
              <div key={section.id} id={section.id}>
                <SectionCard section={section} theme={theme} index={i}>
                  {section.id === "choosing-class" && <ClassRandomizer theme={theme} />}
                </SectionCard>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function NewPlayersGuidePage() {
  return (
    <AppShell currentPath="/guides">
      {({ theme }) => <NewPlayersContent theme={theme} />}
    </AppShell>
  );
}
