import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { MAX_QUERY_LENGTH, WORLD_NAMES } from "../../model/constants";
import { CHARACTERS_COPY } from "../content";
import type { SearchPaneActions, SearchPaneModel } from "../paneModels";
import {
  panelCardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtitleStyle,
  titleStyle,
} from "./uiStyles";

function profileRoleBadgeStyle(
  theme: SearchPaneModel["theme"],
  role: "main" | "champion" | "mule",
) {
  if (role === "main") {
    return {
      background: theme.accentSoft,
      border: `1px solid ${theme.accent}`,
      color: theme.accent,
    };
  }
  if (role === "champion") {
    return {
      background: "#fff4df",
      border: "1px solid #d7a047",
      color: "#8c5b16",
    };
  }
  return {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    color: theme.muted,
  };
}

function getProfileRoleChips(
  isCurrentMainCharacter: boolean,
  isCurrentChampionCharacter: boolean,
): Array<"main" | "champion" | "mule"> {
  if (isCurrentMainCharacter && isCurrentChampionCharacter) return ["main", "champion"];
  if (isCurrentMainCharacter) return ["main"];
  if (isCurrentChampionCharacter) return ["champion"];
  return ["mule"];
}

interface SearchPaneCardProps {
  model: SearchPaneModel;
  actions: SearchPaneActions;
}

export default function SearchPaneCard({ model, actions }: SearchPaneCardProps) {
  const { theme, shell, search, profile } = model;
  const isDirectoryActive =
    profile.showCharacterDirectory && !shell.isSwitchingToDirectory;
  const searchCardRef = useRef<HTMLElement | null>(null);
  const [hasShownResumeSetup, setHasShownResumeSetup] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [stableResumeSetupCharacterName, setStableResumeSetupCharacterName] = useState<
    string | null
  >(search.resumeSetupCharacterName);
  const isStableSearchFrame =
    !shell.isConfirmFadeOut && !shell.isModeTransitioning && !shell.isBackTransitioning;
  const shouldShowResumeSetup =
    search.canResumeSetup && (hasShownResumeSetup || isStableSearchFrame);
  const roleChips = getProfileRoleChips(
    profile.isCurrentMainCharacter,
    profile.isCurrentChampionCharacter,
  );
  const canShowProfileRoleActionsRegion =
    search.setupMode === "search" &&
    search.setupFlowStarted &&
    Boolean(profile.confirmedCharacter) &&
    !isDirectoryActive &&
    profile.isSummaryView &&
    profile.showSummaryNavigation;

  useEffect(() => {
    if (!search.canResumeSetup || !isStableSearchFrame || hasShownResumeSetup) return;
    const markShownTimer = window.setTimeout(() => {
      setHasShownResumeSetup(true);
    }, 0);
    return () => clearTimeout(markShownTimer);
  }, [hasShownResumeSetup, isStableSearchFrame, search.canResumeSetup]);

  useEffect(() => {
    if (!isStableSearchFrame) return;
    const updateLabelTimer = window.setTimeout(() => {
      setStableResumeSetupCharacterName(search.resumeSetupCharacterName);
    }, 0);
    return () => clearTimeout(updateLabelTimer);
  }, [isStableSearchFrame, search.resumeSetupCharacterName]);

  useEffect(() => {
    if (profile.confirmedCharacter) return;
    const closeModalTimer = window.setTimeout(() => {
      setShowRemoveConfirm(false);
    }, 0);
    return () => clearTimeout(closeModalTimer);
  }, [profile.confirmedCharacter]);

  useEffect(() => {
    const element = searchCardRef.current;
    if (!element) return;
    if (shell.isSwitchingToDirectory) {
      const height = element.getBoundingClientRect().height;
      element.style.height = `${height}px`;
      element.style.minHeight = `${height}px`;
      return;
    }
    element.style.height = "";
    element.style.minHeight = "";
  }, [shell.isSwitchingToDirectory]);

  return (
    <>
      <section
        ref={searchCardRef}
        className={[
          "character-search-panel",
          "search-card",
          search.setupFlowStarted &&
          profile.confirmedCharacter &&
          profile.showSummaryNavigation &&
          profile.isSummaryView &&
          !shell.isSwitchingToDirectory &&
          !profile.isStartingOptionalFlow
            ? "profile-shell-fade-in"
            : "",
          profile.isStartingOptionalFlow ? "profile-shell-fade-out" : "",
          profile.isOptionalFlowFadeIn ? "profile-shell-state-fade-in" : "",
          shell.isConfirmFadeOut || shell.isModeTransitioning || shell.isBackTransitioning
            ? "confirm-fade"
            : "",
          shell.isSwitchingToDirectory ? "profile-to-directory-fade" : "",
          !shell.isConfirmFadeOut && !shell.isModeTransitioning && shell.isSearchFadeIn
            ? "search-fade-in"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          ...panelCardStyle(theme, "1.5rem"),
          visibility: shell.isDraftHydrated ? "visible" : "hidden",
        }}
      >
        {search.setupMode === "intro" && (
          <>
            <div style={{ marginBottom: "1rem" }}>
              <h1 style={titleStyle()}>{CHARACTERS_COPY.titles.intro}</h1>
              <p style={subtitleStyle(theme)}>{CHARACTERS_COPY.subtitles.intro}</p>
            </div>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={() => {
                  if (shell.isUiLocked) return;
                  actions.runTransitionToMode("import");
                }}
                style={{
                  ...primaryButtonStyle(theme, "0.9rem 1rem"),
                  borderRadius: "12px",
                  fontSize: "0.95rem",
                  textAlign: "left",
                }}
              >
                {CHARACTERS_COPY.buttons.importCharacter}
              </button>
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={() => actions.runTransitionToMode("search")}
                style={{
                  ...secondaryButtonStyle(theme, "0.9rem 1rem"),
                  borderRadius: "12px",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  textAlign: "left",
                }}
              >
                {CHARACTERS_COPY.buttons.searchCharacter}
              </button>
            </div>
          </>
        )}

        {search.setupMode === "import" && (
          <>
            <div style={{ marginBottom: "1rem" }}>
              <h1 style={titleStyle()}>{CHARACTERS_COPY.titles.import}</h1>
              <p style={subtitleStyle(theme)}>{CHARACTERS_COPY.subtitles.import}</p>
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={actions.runBackToIntroTransition}
                style={secondaryButtonStyle(theme)}
              >
                {CHARACTERS_COPY.buttons.back}
              </button>
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={() => actions.runTransitionToMode("search")}
                style={primaryButtonStyle(theme)}
              >
                {CHARACTERS_COPY.buttons.goToSearch}
              </button>
            </div>
          </>
        )}

        {search.setupMode === "search" && !search.setupFlowStarted && (
          <>
            <div
              style={{
                marginBottom: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <div>
                <h1 style={titleStyle()}>{CHARACTERS_COPY.titles.search}</h1>
                <p style={subtitleStyle(theme)}>{CHARACTERS_COPY.subtitles.search}</p>
                {shouldShowResumeSetup && (
                  <button
                    type="button"
                    disabled={shell.isUiLocked}
                    onClick={actions.resumeSavedSetup}
                    style={{
                      ...secondaryButtonStyle(theme, "0.4rem 0.65rem"),
                      marginTop: "0.45rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    {stableResumeSetupCharacterName
                      ? `Resume setup for ${stableResumeSetupCharacterName}`
                      : CHARACTERS_COPY.buttons.resumeSetup}
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={() => {
                  if (shell.isUiLocked) return;
                  if (profile.isAddingCharacter) {
                    if (search.hasCompletedRequiredFlow) {
                      actions.backFromAddCharacter();
                      return;
                    }
                    actions.runBackToIntroTransition();
                    return;
                  }
                  if (search.hasCompletedRequiredFlow) {
                    actions.backToCharactersDirectory();
                    return;
                  }
                  actions.runBackToIntroTransition();
                }}
                style={{
                  ...secondaryButtonStyle(theme, "0.5rem 0.75rem"),
                  fontSize: "0.85rem",
                  whiteSpace: "nowrap",
                }}
              >
                {profile.isAddingCharacter && search.hasCompletedRequiredFlow
                  ? "Back to characters"
                  : search.hasCompletedRequiredFlow
                    ? "Back to characters"
                    : CHARACTERS_COPY.buttons.back}
              </button>
            </div>

            <form onSubmit={actions.searchSubmit} className="characters-search-row">
              <input
                type="text"
                disabled={shell.isUiLocked}
                value={search.query}
                onChange={(event) => {
                  actions.queryChange(event.target.value);
                }}
                placeholder="In-Game Name"
                maxLength={MAX_QUERY_LENGTH}
                style={{
                  width: "100%",
                  border: `1px solid ${theme.border}`,
                  borderRadius: "12px",
                  background: theme.bg,
                  color: theme.text,
                  fontFamily: "inherit",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  padding: "0.8rem 0.9rem",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={search.isSearching || search.queryInvalid || shell.isUiLocked}
                style={{
                  ...primaryButtonStyle(theme, "0.75rem 1rem"),
                  borderRadius: "12px",
                  background:
                    search.isSearching || search.queryInvalid ? theme.muted : theme.accent,
                  cursor:
                    search.isSearching || search.queryInvalid || shell.isUiLocked
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {search.isSearching
                  ? CHARACTERS_COPY.buttons.searching
                  : CHARACTERS_COPY.buttons.search}
              </button>
            </form>

            <div
              style={{
                marginTop: "0.75rem",
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                borderRadius: "14px",
                padding: "0.8rem 0.95rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.9rem",
                  color: search.statusTone === "error" ? "#dc2626" : theme.muted,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {search.statusMessage}
              </p>
            </div>
          </>
        )}

        {search.setupMode === "search" &&
          search.setupFlowStarted &&
          profile.confirmedCharacter && (
            <div style={{ display: "grid", justifyItems: "center", gap: "0.5rem" }}>
              <div
                className={[
                  "confirmed-summary-card",
                  shell.isBackTransitioning ? "preview-confirm-fade" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  textAlign: "center",
                  gap: "0.35rem",
                  paddingTop: "0.15rem",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    alignSelf: "stretch",
                    display: "flex",
                    justifyContent: "flex-end",
                    minHeight: "34px",
                  }}
                >
                  <button
                    type="button"
                    disabled={shell.isUiLocked}
                    aria-label="View your characters"
                    onClick={
                      profile.showSummaryNavigation
                        ? profile.isSummaryView
                          ? actions.toggleCharacterDirectory
                          : actions.returnToSummaryProfile
                        : actions.backFromSetupFlow
                    }
                    style={{
                      ...secondaryButtonStyle(theme, "0.5rem 0.75rem"),
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      marginLeft: "auto",
                    }}
                  >
                    {profile.showSummaryNavigation ? (
                      profile.isSummaryView ? (
                        <>
                          <span className="desktop-back-label">← View your characters</span>
                          <span className="mobile-back-label">←</span>
                        </>
                      ) : (
                        "Back to profile"
                      )
                    ) : (
                      CHARACTERS_COPY.buttons.back
                    )}
                  </button>
                </div>
                <div
                  className={`confirmed-avatar-wrap ${!profile.confirmedImageLoaded ? "image-skeleton-wrap" : ""}`}
                  style={{
                    width: "210px",
                    height: "210px",
                    borderRadius: "22px",
                  }}
                >
                  <Image
                    src={profile.confirmedCharacter.characterImgURL}
                    alt={`${profile.confirmedCharacter.characterName} avatar`}
                    width={210}
                    height={210}
                    onLoad={actions.confirmedImageLoaded}
                    className={`image-fade-in ${profile.confirmedImageLoaded ? "image-loaded" : ""}`}
                    style={{
                      borderRadius: "22px",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: "100%",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "1.32rem",
                      fontWeight: 800,
                      lineHeight: 1.15,
                      color: theme.text,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    {profile.confirmedCharacter.characterName}
                    {profile.currentCharacterGender === "male" && (
                      <span
                        aria-label="Male"
                        title="Male"
                        style={{ color: "#2563eb", fontSize: "1.02rem", lineHeight: 1 }}
                      >
                        ♂
                      </span>
                    )}
                    {profile.currentCharacterGender === "female" && (
                      <span
                        aria-label="Female"
                        title="Female"
                        style={{ color: "#db2777", fontSize: "1.02rem", lineHeight: 1 }}
                      >
                        ♀
                      </span>
                    )}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.95rem",
                      color: theme.muted,
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {WORLD_NAMES[profile.confirmedCharacter.worldID] ??
                      `ID ${profile.confirmedCharacter.worldID}`}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      color: theme.muted,
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    Level {profile.confirmedCharacter.level}
                  </p>
                  {profile.showSummaryNavigation && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "0.32rem",
                        flexWrap: "wrap",
                        width: "100%",
                        marginTop: "0.35rem",
                        marginBottom: "0.2rem",
                        minHeight: "26px",
                      }}
                    >
                      {roleChips.map((role) => (
                        <span
                          key={role}
                          className="profile-role-chip"
                          style={{
                            ...profileRoleBadgeStyle(theme, role),
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "fit-content",
                            borderRadius: "999px",
                            padding: "0.22rem 0.68rem",
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            letterSpacing: "0.02em",
                            textTransform: "uppercase",
                          }}
                        >
                          {role === "main"
                            ? "Main"
                            : role === "champion"
                              ? "Champion"
                              : "Mule"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </section>
      {canShowProfileRoleActionsRegion && (
        <div
          style={{
            marginTop: "0.5rem",
            width: "100%",
            maxWidth: "300px",
            marginInline: "auto",
            minHeight: "106px",
          }}
        >
          <div
            className={[
              "profile-actions-card",
              !shell.isSwitchingToDirectory && !profile.isStartingOptionalFlow
                ? "profile-actions-fade-in"
                : "",
              profile.isStartingOptionalFlow ? "profile-actions-fade-out" : "",
              shell.isSwitchingToDirectory ? "profile-to-directory-fade" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ display: "grid", gap: "0.4rem" }}
          >
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                background: theme.bg,
                padding: "0.45rem 0.55rem",
                display: "flex",
                justifyContent: "center",
                gap: "0.45rem",
                flexWrap: "wrap",
                boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
              }}
            >
              {!profile.isCurrentMainCharacter && (
                <button
                  type="button"
                  disabled={shell.isUiLocked}
                  onClick={actions.setCurrentAsMain}
                  style={{
                    ...secondaryButtonStyle(theme, "0.28rem 0.62rem"),
                    borderRadius: "999px",
                    width: "fit-content",
                    fontSize: "0.78rem",
                  }}
                >
                  Set main
                </button>
              )}
              {(profile.isCurrentChampionCharacter || profile.canSetCurrentChampion) && (
                <button
                  type="button"
                  disabled={shell.isUiLocked}
                  onClick={actions.toggleCurrentChampion}
                  style={{
                    ...secondaryButtonStyle(theme, "0.28rem 0.62rem"),
                    borderRadius: "999px",
                    width: "fit-content",
                    fontSize: "0.78rem",
                  }}
                >
                  {profile.isCurrentChampionCharacter
                    ? "Remove champion"
                    : "Set champion"}
                </button>
              )}
            </div>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                background: theme.bg,
                padding: "0.45rem 0.55rem",
                display: "flex",
                justifyContent: "center",
                boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
              }}
            >
              <button
                type="button"
                disabled={shell.isUiLocked}
                onClick={() => setShowRemoveConfirm(true)}
                aria-label="Remove character"
                style={{
                  border: "1px solid #ef4444",
                  borderRadius: "999px",
                  background: "#fef2f2",
                  color: "#991b1b",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: "0.78rem",
                  padding: "0.28rem 0.62rem",
                  width: "fit-content",
                  cursor: "pointer",
                }}
              >
                🗑 Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {showRemoveConfirm && profile.confirmedCharacter && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.panel,
              color: theme.text,
              padding: "1rem",
              boxShadow: "0 16px 48px rgba(0,0,0,0.24)",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
              Remove {profile.confirmedCharacter.characterName}?
            </p>
            <p style={{ margin: 0, color: theme.muted, fontSize: "0.86rem", fontWeight: 700 }}>
              This removes the character and local setup data for this profile.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem" }}>
              <button
                type="button"
                onClick={() => setShowRemoveConfirm(false)}
                style={secondaryButtonStyle(theme, "0.5rem 0.75rem")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRemoveConfirm(false);
                  actions.removeCurrentCharacter();
                }}
                style={{
                  border: "1px solid #fca5a5",
                  borderRadius: "10px",
                  background: "#ef4444",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: "0.86rem",
                  padding: "0.5rem 0.8rem",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
