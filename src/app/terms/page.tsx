"use client";

import AppShell from "../../components/AppShell";
import type { AppTheme } from "../../components/themes";

function Section({
  theme,
  title,
  children,
}: {
  theme: AppTheme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          fontSize: "0.95rem",
          fontWeight: 800,
          color: theme.text,
          marginBottom: "0.4rem",
        }}
      >
        {title}
      </div>
      <div style={{ color: theme.text, fontSize: "0.88rem", lineHeight: 1.7, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  );
}

function TermsContent({ theme }: { theme: AppTheme }) {
  return (
    <div className="page-content">
      <div className="page-container">
        <div className="page-title" style={{ color: theme.text }}>
          Terms of Service
        </div>
        <div className="page-subtitle" style={{ color: theme.muted }}>
          Last updated: April 10, 2026
        </div>

        <div
          className="fade-in panel-card"
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: "14px",
            padding: "1.5rem 1.75rem",
            marginTop: "1rem",
          }}
        >
          <Section theme={theme} title="1. Acceptance of Terms">
            By accessing or using MapleDoro, you agree to be bound by these
            Terms of Service. If you do not agree, please do not use the site.
          </Section>

          <Section theme={theme} title="2. Nature of the Service">
            MapleDoro is a free, open-source, non-commercial fan project
            provided &quot;as is&quot; for the MapleStory community. The
            service is not affiliated with, endorsed, or supported by Nexon,
            Wizet, or any of their partners.
          </Section>

          <Section theme={theme} title="3. No Accounts, No Personal Data">
            MapleDoro does not require an account. All user data (characters,
            progress, settings) is stored locally in your browser via
            localStorage. We do not collect, store, or transmit personal
            information to any server we control.
          </Section>

          <Section theme={theme} title="4. Acceptable Use">
            You agree not to use MapleDoro for any unlawful purpose, to abuse
            its public APIs, or to attempt to disrupt the service for other
            users. Automated scraping or excessive request volume may result in
            rate limiting.
          </Section>

          <Section theme={theme} title="5. Third-Party Content">
            MapleDoro displays data from third-party sources including
            MapleStory Wiki, the Nexon CDN, and Discord. We do not control
            those sources and are not responsible for their availability,
            accuracy, or content.
          </Section>

          <Section theme={theme} title="6. Intellectual Property">
            MapleStory and all related assets — including but not limited to
            images, characters, and names — are the intellectual property and
            registered trademarks of Nexon. MapleDoro uses these assets under
            fair use for a non-commercial fan project. All rights remain with
            their respective owners.
          </Section>

          <Section theme={theme} title="7. Disclaimer of Warranty">
            MapleDoro is provided without warranty of any kind, express or
            implied. The maintainers do not guarantee that the service will be
            accurate, reliable, uninterrupted, or error-free.
          </Section>

          <Section theme={theme} title="8. Limitation of Liability">
            In no event shall the maintainers of MapleDoro be liable for any
            damages arising from the use or inability to use the service,
            including but not limited to loss of data or game progress.
          </Section>

          <Section theme={theme} title="9. Changes to These Terms">
            These Terms may be updated from time to time. Continued use of
            MapleDoro after changes constitutes acceptance of the updated
            Terms. The &quot;Last updated&quot; date at the top of this page
            reflects the most recent revision.
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <AppShell currentPath="/terms">
      {({ theme }) => <TermsContent theme={theme} />}
    </AppShell>
  );
}
