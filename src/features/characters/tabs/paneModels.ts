import type { AppTheme } from "../../../components/themes";
import type { NormalizedCharacterData } from "../model/types";
import type { SetupFlowDefinition, SetupFlowId } from "../setup/flows";
import type { SetupMode } from "../model/constants";

export interface SearchPaneModel {
  theme: AppTheme;
  shell: {
    isDraftHydrated: boolean;
    isConfirmFadeOut: boolean;
    isModeTransitioning: boolean;
    isSearchFadeIn: boolean;
    isBackTransitioning: boolean;
    isSwitchingToDirectory: boolean;
    isUiLocked: boolean;
  };
  search: {
    setupMode: SetupMode;
    setupFlowStarted: boolean;
    hasCompletedRequiredFlow: boolean;
    canResumeSetup: boolean;
    resumeSetupCharacterName: string | null;
    query: string;
    queryInvalid: boolean;
    isSearching: boolean;
    statusMessage: string;
    statusTone: "neutral" | "error";
  };
  profile: {
    confirmedCharacter: NormalizedCharacterData | null;
    confirmedImageLoaded: boolean;
    showCharacterDirectory: boolean;
    showSummaryNavigation: boolean;
    isSummaryView: boolean;
    isAddingCharacter: boolean;
    isCurrentMainCharacter: boolean;
    isCurrentChampionCharacter: boolean;
    canSetCurrentChampion: boolean;
    currentCharacterGender: "male" | "female" | null;
    isStartingOptionalFlow: boolean;
    isOptionalFlowFadeIn: boolean;
  };
}

export interface SearchPaneActions {
  runTransitionToMode: (nextMode: SetupMode) => void;
  runBackToIntroTransition: () => void;
  backFromSetupFlow: () => void;
  backToCharactersDirectory: () => void;
  returnToSummaryProfile: () => void;
  backFromAddCharacter: () => void;
  resumeSavedSetup: () => void;
  setCurrentAsMain: () => void;
  toggleCurrentChampion: () => void;
  removeCurrentCharacter: () => void;
  searchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  queryChange: (value: string) => void;
  confirmedImageLoaded: () => void;
  toggleCharacterDirectory: () => void;
}

export interface PreviewPaneModel {
  theme: AppTheme;
  preview: {
    foundCharacter: NormalizedCharacterData | null;
    previewCardReady: boolean;
    previewContentReady: boolean;
    previewImageLoaded: boolean;
    isConfirmFadeOut: boolean;
    isModeTransitioning: boolean;
  };
  setup: {
    setupFlowStarted: boolean;
    setupPanelVisible: boolean;
    isBackTransitioning: boolean;
    isFinishingSetup: boolean;
    isSwitchingToDirectory: boolean;
    isSwitchingToProfile: boolean;
    isUiLocked: boolean;
    isStartingOptionalFlow: boolean;
    isOptionalFlowFadeIn: boolean;
    activeFlowId: SetupFlowId;
    completedFlowIds: SetupFlowId[];
    optionalFlows: readonly SetupFlowDefinition[];
    showFlowOverview: boolean;
    showCharacterDirectory: boolean;
    fastDirectoryRevealOnce: boolean;
    setupStepIndex: number;
    setupStepDirection: "forward" | "backward";
    activeSetupStepValue: string;
  };
  directory: {
    allCharacters: NormalizedCharacterData[];
    mainCharacterKey: string | null;
    championCharacterKeys: string[];
    maxCharacters: number;
    maxChampions: number;
  };
}

export interface PreviewPaneActions {
  setPreviewImageLoaded: (loaded: boolean) => void;
  confirmFoundCharacter: () => void;
  setSetupStepWithDirection: (step: number) => void;
  stepValueChange: (value: string) => void;
  finishSetupFlow: () => void;
  startOptionalFlow: (flowId: SetupFlowId) => void;
  openCharacterSearch: () => void;
  openCharacterProfile: (character: NormalizedCharacterData) => void;
}
