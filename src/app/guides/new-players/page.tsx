"use client";

/*
  New Players Guide page.
  A long-form guide with text sections and images for MapleStory beginners.
*/
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
    body: "Section content goes here.",
  },
  {
    id: "choosing-class",
    title: "Choosing Your Class",
    image: undefined,
    imageAlt: "",
    body: "Section content goes here.",
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

/* ── Components ────────────────────────────────────────────────── */

function SectionCard({
  section,
  theme,
  index,
}: {
  section: GuideSection;
  theme: AppTheme;
  index: number;
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
                <SectionCard section={section} theme={theme} index={i} />
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
