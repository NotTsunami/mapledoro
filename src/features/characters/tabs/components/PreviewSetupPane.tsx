import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { WORLD_NAMES } from "../../model/constants";
import { toCharacterKey } from "../../model/characterKeys";
import type { NormalizedCharacterData } from "../../model/types";
import StepRenderer from "../../setup/StepRenderer";
import { getRequiredSetupFlowId, type SetupFlowId } from "../../setup/flows";
import {
  buildDirectoryGroups,
  getDirectoryRevealDelays,
  getDirectoryRevealStyle,
  type DirectorySortBy,
} from "../charactersDirectory";
import type { PreviewPaneActions, PreviewPaneModel } from "../paneModels";
import { CHARACTERS_COPY } from "../content";
import { panelCardStyle, primaryButtonStyle, secondaryButtonStyle } from "./uiStyles";

interface PreviewSetupPaneProps {
  model: PreviewPaneModel;
  actions: PreviewPaneActions;
}

export default function PreviewSetupPane({ model, actions }: PreviewSetupPaneProps) {
  const { theme, preview, setup, directory } = model;
  const requiredFlowDone = setup.completedFlowIds.includes(getRequiredSetupFlowId());
  const [selectedModuleFlowId, setSelectedModuleFlowId] = useState<SetupFlowId | null>(
    setup.optionalFlows[0]?.id ?? null,
  );
  const [directorySortBy, setDirectorySortBy] = useState<DirectorySortBy>("name");
  const [directoryRevealPhase, setDirectoryRevealPhase] = useState(0);

  const selectedModuleFlow = useMemo(
    () =>
      setup.optionalFlows.find((flow) => flow.id === selectedModuleFlowId) ??
      setup.optionalFlows[0] ??
      null,
    [selectedModuleFlowId, setup.optionalFlows],
  );

  const {
    sortedCharacters,
    mainCharacter,
    championCharacters,
    championCharactersForDirectory,
    otherCharacters,
    muleCapacity,
    canAddCharacter,
    hasChampionSection,
    isMainAlsoChampion,
  } = useMemo(
    () =>
      buildDirectoryGroups({
        allCharacters: directory.allCharacters,
        sortBy: directorySortBy,
        mainCharacterKey: directory.mainCharacterKey,
        championCharacterKeys: directory.championCharacterKeys,
        maxCharacters: directory.maxCharacters,
      }),
    [
      directory.allCharacters,
      directory.championCharacterKeys,
      directory.mainCharacterKey,
      directory.maxCharacters,
      directorySortBy,
    ],
  );

  const inCharacterDirectoryView = setup.showFlowOverview && setup.showCharacterDirectory;
  const shouldShowDirectoryPanel =
    inCharacterDirectoryView &&
    !setup.isSwitchingToDirectory &&
    directoryRevealPhase > 0;

  useEffect(() => {
    if (!inCharacterDirectoryView || setup.isSwitchingToDirectory) {
      const resetPhaseTimer = window.setTimeout(() => {
        setDirectoryRevealPhase(0);
      }, 0);
      return () => clearTimeout(resetPhaseTimer);
    }
  }, [inCharacterDirectoryView, setup.isSwitchingToDirectory]);

  useEffect(() => {
    if (!inCharacterDirectoryView || setup.isSwitchingToDirectory) return;
    const startPhaseTimer = window.setTimeout(() => {
      setDirectoryRevealPhase(0);
    }, 0);
    const { mainDelay, championDelay, mulesDelay } = getDirectoryRevealDelays(
      setup.fastDirectoryRevealOnce,
      hasChampionSection,
    );
    const mainTimer = window.setTimeout(() => setDirectoryRevealPhase(1), mainDelay);
    const championsTimer = window.setTimeout(() => setDirectoryRevealPhase(2), championDelay);
    const mulesTimer = window.setTimeout(() => setDirectoryRevealPhase(3), mulesDelay);
    return () => {
      clearTimeout(startPhaseTimer);
      clearTimeout(mainTimer);
      clearTimeout(championsTimer);
      clearTimeout(mulesTimer);
    };
  }, [
    hasChampionSection,
    inCharacterDirectoryView,
    setup.fastDirectoryRevealOnce,
    setup.isSwitchingToDirectory,
  ]);

  const renderCharacterCard = (
    character: NormalizedCharacterData,
    variant: "main" | "champion" | "mule" = "mule",
  ) => {
    const key = toCharacterKey(character);
    const cardSizeStyle = {
      flex: "0 0 auto",
      width: "min(190px, 100%)",
      minWidth: "160px",
      maxWidth: "190px",
    } as const;

    return (
      <div
        key={key}
        style={{ ...cardSizeStyle, display: "flex", justifyContent: "center", alignItems: "flex-start" }}
      >
        <button
          type="button"
          disabled={setup.isUiLocked}
          onClick={() => actions.openCharacterProfile(character)}
          style={{
            display: "grid",
            placeItems: "center",
            gap: "0.35rem",
            background: "transparent",
            border: "none",
            padding: 0,
            color: theme.text,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Image
            src={character.characterImgURL}
            alt={`${character.characterName} avatar`}
            width={78}
            height={78}
            style={{
              borderRadius: "12px",
              objectFit: variant === "mule" ? "contain" : "contain",
              objectPosition: "center bottom",
            }}
          />
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 800,
              lineHeight: 1.15,
              color: theme.text,
              textAlign: "center",
              maxWidth: "100%",
              whiteSpace: "nowrap",
            }}
          >
            {character.characterName}
          </span>
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              lineHeight: 1.1,
              color: theme.muted,
              textAlign: "center",
            }}
          >
            Lv {character.level}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="preview-pane">
      {preview.foundCharacter && preview.previewCardReady && !setup.setupFlowStarted && (
        <aside
          className={`character-search-panel preview-card ${preview.isConfirmFadeOut || setup.isBackTransitioning || preview.isModeTransitioning ? "confirm-fade" : ""} ${setup.isBackTransitioning || preview.isModeTransitioning ? "back-fade" : ""}`}
          style={panelCardStyle(theme, "1rem")}
        >
          <div
            className={`preview-content ${preview.isConfirmFadeOut || setup.isBackTransitioning || preview.isModeTransitioning ? "preview-confirm-fade" : ""} ${setup.isBackTransitioning || preview.isModeTransitioning ? "back-fade-content" : ""}`}
            style={{
              opacity: preview.previewContentReady ? 1 : 0,
              transform: preview.previewContentReady ? "translateY(0)" : "translateY(6px)",
            }}
          >
            <div
              key={`${preview.foundCharacter.characterName}:${preview.foundCharacter.fetchedAt}`}
              className="preview-char-swap"
              style={{
                display: "flex",
                gap: "0.65rem",
                alignItems: "center",
                marginBottom: "0.6rem",
              }}
            >
              <div
                className={!preview.previewImageLoaded ? "image-skeleton-wrap" : undefined}
                style={{ width: "72px", height: "72px", borderRadius: "12px" }}
              >
                <Image
                  src={preview.foundCharacter.characterImgURL}
                  alt={`${preview.foundCharacter.characterName} avatar`}
                  width={72}
                  height={72}
                  onLoad={() => actions.setPreviewImageLoaded(true)}
                  className={`image-fade-in ${preview.previewImageLoaded ? "image-loaded" : ""}`}
                  style={{ borderRadius: "12px", display: "block", objectFit: "cover" }}
                />
              </div>
              <div>
                <p style={{ fontSize: "1rem", fontWeight: 800, lineHeight: 1.1, margin: 0, marginBottom: "0.16rem" }}>
                  {preview.foundCharacter.characterName}
                </p>
                <p style={{ fontSize: "0.82rem", color: theme.muted, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>
                  {WORLD_NAMES[preview.foundCharacter.worldID] ?? `ID ${preview.foundCharacter.worldID}`}
                </p>
                <p style={{ fontSize: "0.82rem", color: theme.muted, fontWeight: 700, lineHeight: 1.2, margin: 0, marginTop: "0.08rem" }}>
                  Level {preview.foundCharacter.level} · {preview.foundCharacter.jobName}
                </p>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: "0.65rem" }}>
              <p style={{ fontSize: "0.86rem", color: theme.text, fontWeight: 700, margin: 0, marginBottom: "0.72rem" }}>
                {CHARACTERS_COPY.titles.confirmPrompt}
              </p>
              <button
                type="button"
                disabled={setup.isUiLocked}
                onClick={actions.confirmFoundCharacter}
                style={{ ...primaryButtonStyle(theme, "0.7rem 0.9rem"), width: "100%" }}
              >
                {CHARACTERS_COPY.buttons.confirm}
              </button>
            </div>
          </div>
        </aside>
      )}

      {setup.setupFlowStarted && (
        <aside
          className={`character-search-panel setup-panel ${setup.setupPanelVisible ? "setup-panel-visible" : ""} ${setup.isBackTransitioning ? "setup-panel-fade" : ""} ${setup.isFinishingSetup ? "setup-finish-fade" : ""} ${setup.isStartingOptionalFlow ? "setup-panel-fade-out" : ""} ${setup.isSwitchingToDirectory || setup.isSwitchingToProfile ? "profile-to-directory-fade" : ""} ${setup.showFlowOverview && !setup.showCharacterDirectory && !setup.isSwitchingToDirectory ? "summary-panel-fade-in" : ""} ${!setup.showFlowOverview && setup.isOptionalFlowFadeIn ? "step-panel-fade-in" : ""}`}
          style={{
            ...panelCardStyle(theme, "1rem"),
            position: "relative",
            opacity: inCharacterDirectoryView && !shouldShowDirectoryPanel ? 0 : 1,
            transform:
              inCharacterDirectoryView && !shouldShowDirectoryPanel
                ? "translateY(8px)"
                : "translateY(0)",
            visibility:
              inCharacterDirectoryView && !shouldShowDirectoryPanel ? "hidden" : "visible",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        >
          <div
            key={`setup-step-${setup.setupStepIndex}-${setup.showFlowOverview ? "summary" : "flow"}-${setup.showCharacterDirectory ? "directory" : "profile"}`}
            className={`setup-step-content ${
              setup.showFlowOverview
                ? "directory-step-content"
                : setup.isOptionalFlowFadeIn
                  ? "step-no-slide"
                  : setup.setupStepDirection === "forward"
                    ? "step-forward"
                    : "step-backward"
            } ${!setup.showFlowOverview && setup.isOptionalFlowFadeIn ? "step-flow-fade-in" : ""}`}
          >
            {setup.showFlowOverview ? (
              setup.showCharacterDirectory ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <h2 style={{ margin: 0, fontFamily: "'Fredoka One', cursive", fontSize: "1.2rem", lineHeight: 1.2, color: theme.text }}>
                      View Your Characters
                    </h2>
                  </div>
                  <div style={{ display: "grid", gap: "0.7rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.65rem", border: `1px solid ${theme.border}`, borderRadius: "12px", background: theme.bg, padding: "0.7rem" }}>
                      <span style={{ fontSize: "0.78rem", color: theme.muted, fontWeight: 800 }}>Sort rows</span>
                      <select
                        disabled={setup.isUiLocked}
                        value={directorySortBy}
                        onChange={(event) => setDirectorySortBy(event.target.value as DirectorySortBy)}
                        style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", background: theme.panel, color: theme.text, fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, padding: "0.25rem 0.4rem" }}
                      >
                        <option value="name">Alphabetical</option>
                        <option value="level">By Level</option>
                        <option value="class">By Class</option>
                      </select>
                    </div>

                    <div style={{ borderTop: `1px solid ${theme.border}`, marginTop: "0.15rem" }} />
                    <section style={getDirectoryRevealStyle(shouldShowDirectoryPanel && directoryRevealPhase >= 1)}>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: theme.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.5rem" }}>Main Character</p>
                      {mainCharacter ? (
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "flex-start", gap: "0.6rem", width: "100%" }}>
                          {renderCharacterCard(mainCharacter, "main")}
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: theme.muted, fontWeight: 700 }}>
                          {sortedCharacters.length > 0 ? "No main selected yet." : "No characters added yet."}
                        </p>
                      )}
                    </section>

                    {(championCharactersForDirectory.length > 0 || isMainAlsoChampion) && (
                      <section style={getDirectoryRevealStyle(shouldShowDirectoryPanel && directoryRevealPhase >= 2)}>
                        <div style={{ borderTop: `1px solid ${theme.border}`, marginBottom: "0.7rem" }} />
                        <p style={{ margin: 0, fontSize: "0.75rem", color: theme.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.5rem" }}>
                          Champions ({championCharacters.length}/{directory.maxChampions})
                        </p>
                        {isMainAlsoChampion && (
                          <p style={{ margin: 0, marginBottom: "0.45rem", fontSize: "0.74rem", color: theme.muted, fontWeight: 700 }}>
                            Main is also set as champion.
                          </p>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "flex-start", gap: "0.6rem", overflow: "hidden", width: "100%", paddingBottom: "0.15rem" }}>
                          {championCharactersForDirectory.map((character) => renderCharacterCard(character, "champion"))}
                        </div>
                      </section>
                    )}

                    <section style={getDirectoryRevealStyle(shouldShowDirectoryPanel && directoryRevealPhase >= (hasChampionSection ? 3 : 2))}>
                      <div style={{ borderTop: `1px solid ${theme.border}`, marginBottom: "0.7rem" }} />
                      <p style={{ margin: 0, fontSize: "0.75rem", color: theme.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.5rem" }}>
                        Mules ({otherCharacters.length}/{muleCapacity})
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "flex-start", gap: "0.6rem", overflow: "hidden", width: "100%", paddingBottom: "0.15rem" }}>
                        {otherCharacters.map((character) => renderCharacterCard(character, "mule"))}
                        <button
                          type="button"
                          onClick={actions.openCharacterSearch}
                          disabled={!canAddCharacter || setup.isUiLocked}
                          style={{
                            ...secondaryButtonStyle(theme, "0.5rem 0.65rem"),
                            flex: "0 0 auto",
                            minWidth: "160px",
                            maxWidth: "190px",
                            width: "min(190px, 100%)",
                            height: "120px",
                            borderRadius: "12px",
                            fontSize: "1.45rem",
                            fontWeight: 900,
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.3rem",
                            opacity: canAddCharacter ? 1 : 0.55,
                            cursor: canAddCharacter ? "pointer" : "not-allowed",
                          }}
                        >
                          <span>+</span>
                          <span style={{ fontSize: "0.76rem", fontWeight: 800 }}>Add character</span>
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <h2 style={{ margin: 0, fontFamily: "'Fredoka One', cursive", fontSize: "1.15rem", lineHeight: 1.2, color: theme.text }}>
                      Character Summary
                    </h2>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {setup.optionalFlows.map((flow) => {
                        const done = setup.completedFlowIds.includes(flow.id);
                        const locked = !requiredFlowDone;
                        return (
                          <button
                            key={flow.id}
                            type="button"
                            disabled={setup.isUiLocked}
                            onClick={() => setSelectedModuleFlowId(flow.id)}
                            style={{
                              ...secondaryButtonStyle(theme, "0.35rem 0.55rem"),
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              opacity: locked ? 0.45 : 1,
                              borderStyle: done ? "solid" : "dashed",
                              background: selectedModuleFlow?.id === flow.id ? theme.accentSoft : theme.bg,
                              cursor: "pointer",
                            }}
                          >
                            {flow.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ border: `1px dashed ${theme.border}`, borderRadius: "12px", padding: "0.95rem", color: theme.muted, background: theme.bg, fontSize: "0.83rem", fontWeight: 700, minHeight: "220px" }}>
                    <p style={{ margin: 0, marginBottom: "0.55rem", color: theme.text, fontWeight: 800 }}>
                      {selectedModuleFlow?.label ?? "Module"} placeholder
                    </p>
                    <p style={{ margin: 0, marginBottom: "0.85rem", color: theme.muted, fontSize: "0.8rem" }}>
                      {selectedModuleFlow?.description ?? "Module details will appear here."}
                    </p>
                    <button
                      type="button"
                      disabled={!requiredFlowDone || !selectedModuleFlow || setup.isUiLocked}
                      onClick={() => {
                        if (selectedModuleFlow) actions.startOptionalFlow(selectedModuleFlow.id);
                      }}
                      style={{
                        ...primaryButtonStyle(theme, "0.45rem 0.7rem"),
                        fontSize: "0.8rem",
                        opacity: !requiredFlowDone ? 0.6 : 1,
                        cursor: !requiredFlowDone ? "not-allowed" : "pointer",
                      }}
                    >
                      Start setup flow
                    </button>
                  </div>
                </div>
              )
            ) : setup.setupStepIndex === 0 ? (
              <>
                <h2 style={{ margin: 0, marginBottom: "0.45rem", fontFamily: "'Fredoka One', cursive", fontSize: "1.3rem", lineHeight: 1.2, color: theme.text }}>
                  {CHARACTERS_COPY.titles.setupIntro}
                </h2>
                <p style={{ margin: 0, fontSize: "0.9rem", color: theme.muted, fontWeight: 700, marginBottom: "0.9rem" }}>
                  {CHARACTERS_COPY.subtitles.setupIntro}
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    disabled={setup.isUiLocked}
                    onClick={() => actions.setSetupStepWithDirection(1)}
                    style={primaryButtonStyle(theme, "0.55rem 0.9rem")}
                  >
                    {CHARACTERS_COPY.buttons.nextStep}
                  </button>
                </div>
              </>
            ) : (
              <StepRenderer
                theme={theme}
                flowId={setup.activeFlowId}
                stepIndex={setup.setupStepIndex}
                stepValue={setup.activeSetupStepValue}
                onStepValueChange={actions.stepValueChange}
                onBackStep={() => actions.setSetupStepWithDirection(setup.setupStepIndex - 1)}
                onNextStep={() => actions.setSetupStepWithDirection(setup.setupStepIndex + 1)}
                onFinish={actions.finishSetupFlow}
              />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
