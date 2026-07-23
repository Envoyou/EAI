import { AnalysisResult, EditorialProcessStage } from '@eai/shared';

export interface FeedbackPanelProps {
  result: AnalysisResult;
  title?: string;
  onApplyFix?: (
    targetText: string,
    replacementText: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => Promise<boolean>;
  onApplyAll?: () => Promise<void>;
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
  includeSeoStage?: boolean;
  isRefining?: boolean;
  onAcceptFeedback?: (index: number) => Promise<void>;
  onRemoveFeedbackAddition?: (index: number) => Promise<void>;
  onAddFeedbackSource?: (index: number, url: string) => Promise<boolean>;
  onFixFeedbackWithEAI?: (index: number) => Promise<void>;
  isTargetedFixing?: number | null;
}
