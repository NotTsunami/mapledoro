import type { SearchPaneActions, SearchPaneModel } from "../paneModels";
import { CHARACTERS_COPY } from "../content";
import { secondaryButtonStyle, dangerButtonStyle } from "../components/uiStyles";

function TrashIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

interface CharacterProfileActionsScreenProps {
  model: SearchPaneModel;
  actions: SearchPaneActions;
  onRequestRemove: () => void;
}

export default function CharacterProfileActionsScreen({
  model,
  actions,
  onRequestRemove,
}: CharacterProfileActionsScreenProps) {
  const { theme, shell, profile } = model;
  const canShow =
    profile.confirmedCharacter &&
    profile.canViewCharacterDirectory &&
    !profile.showCharacterDirectory &&
    !profile.setupStepActive;
  if (!canShow) return null;

  return (
    <div
      className="profile-actions-wrap"
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
          !shell.isSwitchingToDirectory ? "profile-actions-fade-in" : "",
          shell.isSwitchingToDirectory ? "profile-to-directory-fade" : "",
          shell.isDeleteTransitioning ? "deleting" : "",
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
          <button
            className="profile-action-button tap-target-44"
            type="button"
            disabled={shell.isUiLocked}
            onClick={profile.isCurrentMainCharacter ? actions.removeCurrentAsMain : actions.setCurrentAsMain}
            style={{
              ...secondaryButtonStyle(theme, "0.28rem 0.62rem"),
              borderRadius: "999px",
              width: "fit-content",
              fontSize: "0.78rem",
            }}
          >
            {profile.isCurrentMainCharacter
              ? CHARACTERS_COPY.characterProfileActions.removeMainButton
              : CHARACTERS_COPY.characterProfileActions.setMainButton}
          </button>
          {(profile.isCurrentChampionCharacter || profile.canSetCurrentChampion) && (
            <button
              className="profile-action-button tap-target-44"
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
                ? CHARACTERS_COPY.characterProfileActions.removeChampionButton
                : CHARACTERS_COPY.characterProfileActions.setChampionButton}
            </button>
          )}
          <div className="profile-actions-divider" aria-hidden="true" />
          <button
            className="profile-action-button profile-action-danger tap-target-44"
            type="button"
            disabled={shell.isUiLocked}
            onClick={onRequestRemove}
            aria-label="Remove character"
            style={{ ...dangerButtonStyle(theme), display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
            <TrashIcon />
            {CHARACTERS_COPY.characterProfileActions.removeCharacterButton}
          </button>
        </div>
      </div>
    </div>
  );
}
