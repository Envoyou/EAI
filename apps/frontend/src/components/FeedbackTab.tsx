'use client';

import FeedbackPanel from '@/components/FeedbackPanel';
import type { AnalysisResult, EditorialProcessStage } from '@eai/shared';

interface FeedbackTabProps {
  result: AnalysisResult;
  title?: string;
  onApplyFix?: (targetText: string, replacementText: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => Promise<boolean>;
  onApplyAll?: () => Promise<void>;
  hoveredFeedbackIndex: number | null;
  onHoveredFeedbackChange: (index: number | null) => void;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
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

export default function FeedbackTab(props: FeedbackTabProps) {
  return (
    <div className="h-full overflow-hidden min-w-0 w-full">
      <FeedbackPanel
        key={`${props.result.analysisLogId ?? props.result.sourceRef ?? 'analysis'}:${props.result.status}`}
        {...props}
        isSidebarMode={true}
      />
    </div>
  );
}
