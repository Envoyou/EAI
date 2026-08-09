import type {
  ChatMessage,
  Attachment,
  ChatSession,
  QuickDraftMode,
} from '@/lib/hooks/useContentStrategist';

export interface StrategistTabProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  isTyping: boolean;
  handleSend: (forcedText?: string) => void;
  handleRewrite: (msgId: string) => void;
  handleCopy: (text: string, msgId: string) => void;
  saveNote: (msg: ChatMessage) => void;
  copiedMessageId: string | null;
  uploadedAttachment: Attachment | null;
  setUploadedAttachment: (attachment: Attachment | null) => void;
  handleFileUpload: (file: File) => Promise<void>;
  enableSearch: boolean;
  setEnableSearch: (v: boolean) => void;
  researchMode: 'fast' | 'deep';
  setResearchMode: (v: 'fast' | 'deep') => void;
  currentSessionId: string | null;
  setCurrentSessionId: (v: string | null) => void;
  sessions: ChatSession[];
  isSessionsLoading: boolean;
  selectSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePinSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  startNewChat: () => void;
  onCancelChat?: () => void;
  quickDraftMode: QuickDraftMode | null;
  openQuickDraft: (mode: QuickDraftMode) => void;
  setQuickDraftMode: (mode: QuickDraftMode) => void;
  closeQuickDraft: () => void;
  quickDraftTopic: string;
  setQuickDraftTopic: (value: string) => void;
  quickDraftOutline: string;
  setQuickDraftOutline: (value: string) => void;
  quickDraftReference: string;
  setQuickDraftReference: (value: string) => void;
  quickDraftOutput: string;
  quickDraftError: string | null;
  isGeneratingQuickDraft: boolean;
  submitQuickDraft: () => Promise<void>;
}
