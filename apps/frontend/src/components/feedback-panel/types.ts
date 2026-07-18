import { AnalysisResult, EditorialProcessStage } from '@eai/shared';

export interface FeedbackPanelProps {
  result: AnalysisResult;
  title?: string;
  onApplyFix?: (
    targetText: string,
    replacementText: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => boolean;
  onApplyAll?: () => void;
  isFocused?: boolean;
  onFocusToggle?: () => void;
  hoveredFeedbackIndex: number | null;
  onHoveredFeedbackChange: (index: number | null) => void;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  isSidebarMode?: boolean;
  isProcessing?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
  isRefining?: boolean;
  onAcceptFeedback?: (index: number) => void;
  onRemoveFeedbackAddition?: (index: number) => Promise<void>;
  onAddFeedbackSource?: (index: number, url: string) => void;
  onMarkFeedbackVerified?: (index: number) => void;
  onFixFeedbackWithEAI?: (index: number) => Promise<void>;
  isTargetedFixing?: number | null;
}
