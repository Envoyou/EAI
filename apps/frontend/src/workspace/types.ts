import type {
  AnalysisResult,
  ArticleMetadata,
  ResearchNote,
  Attachment,
  EditorialProcessStage,
  EditorialReadiness,
  FeedbackItem,
  PublicationPackage,
  PublicationPackageStatus,
} from '@eai/shared';
import type { AppSettings } from '@/lib/preferences';
import type { PanelTab } from '@/components/PanelTabBar';
import type { TimeoutRequestInit } from '@/lib/fetch-utils';

export interface EditorialOptions {
  brandName: string;
  categories: string[];
  articleTypes: string[];
  sourcePolicy: 'standard' | 'strict';
  isPersonal: boolean;
  maxTextLength: number;
  cmsExportEnabled: boolean;
  activePlan: string;
}

export type WorkspaceMode = 'demo' | 'workspace';
export type AnalysisSpeed = 'fast' | 'publish';

export interface PendingRefineAction {
  type: 'analyze' | 'refine_again';
  overrideDraft?: string;
  instruction?: string;
}

export type EditorHandoffDestination = 'review' | 'publication';

export interface AnalysisCompletion {
  analysisLogId: string;
  readiness?: EditorialReadiness;
  feedback: FeedbackItem[];
  generatedMetadata?: PublicationPackage;
  publicationPackageStatus: PublicationPackageStatus;
}

export interface EditorHandoffState extends AnalysisCompletion {
  destination: EditorHandoffDestination;
  unresolvedFindingCount: number;
  blockingFindingCount: number;
  hasSeoPackage: boolean;
}

export type DirectFetchType = (path: string, options?: TimeoutRequestInit) => Promise<Response>;

export interface WorkspaceState {
  workspaceChecking: boolean;
  editorialOptions: EditorialOptions;
  draft: string;
  metadata: ArticleMetadata;
  analysis: AnalysisResult;
  activeHistoryId: string | null;
  refreshTrigger: number;
  draftHistory: string[];
  sourceDraft: string;
  isStreaming: boolean;
  isRefining: boolean;
  isAiBusy: boolean;
  processStage: EditorialProcessStage;
  processStartedAt: number | null;
  appSettings: AppSettings;
  isDemoMode: boolean;
  demoRefineCount: number;
  showDemoSignupModal: boolean;
  sidebarOpen: boolean;
  isShortcutModalOpen: boolean;
  activeTab: PanelTab;
  isMobile: boolean;
  mobileViewTab: 'history' | 'editor' | 'copilot';
  isLoaded: boolean;
  hoveredFeedbackIndex: number | null;
  activeFeedbackIndex: number | null;
  rightPanelOpen: boolean;
  rightPanelTab: 'strategist' | 'feedback' | 'notes' | 'deep_report';
  layoutReversed: boolean;
  showMissingSourcesModal: boolean;
  missingSources: { url: string; domain: string }[];
  pendingRefineAction: PendingRefineAction | null;
  researchNotes: ResearchNote[];
  hasNotes: boolean;
  attachments: Attachment[];
  analysisSpeed: AnalysisSpeed;
  isTargetedFixing: number | null;
  isSavingToCloud: boolean;
  isGeneratingDraftFromNotes: boolean;
}
