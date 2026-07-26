export type DirectoryUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  onboardingRole?: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  imageUrl: string | null;
  trialUsed: boolean;
  plan: string;
  credits: number;
  analysesCount: number;
  isBanned: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    publicationName?: string | null;
    domain?: string | null;
    acquisitionSource?: string | null;
    acquisitionSourceOther?: string | null;
    primaryGoal?: string | null;
    onboardingCompletedAt?: string | null;
  } | null;
  onboardingDraft: {
    step: string;
  } | null;
};

export type PaginationMeta = {
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
};

export type UserSubscription = {
  plan: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd: string;
  lastCreditAllocation?: string | null;
  cancelReason?: string | null;
  cancelFeedback?: string | null;
};

export type UserDetailsData = {
  user: DirectoryUser;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysisLogs: any[];
  activeSubscription?: UserSubscription | null;
  queuedSubscription?: UserSubscription | null;
};

export type ModalType = 'adjust-credits' | 'view-details' | 'ban-confirm' | 'send-invite' | null;
