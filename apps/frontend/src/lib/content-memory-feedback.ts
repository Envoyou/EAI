'use client';

import { toast } from 'sonner';
import type { TimeoutRequestInit } from '@/lib/fetch-utils';

type DirectFetch = (
  path: string,
  options?: TimeoutRequestInit
) => Promise<Response>;

export const promptContentMemoryFeedback = (params: {
  directFetch: DirectFetch;
  requestId: string;
  question: string;
  duplicateLabel: string;
  distinctLabel: string;
  savedMessage: string;
  failedMessage: string;
  userAction: 'continued' | 'overrode_block';
}) => {
  const submit = async (laterConfirmedDuplicate: boolean) => {
    const response = await params.directFetch('/api/content-memory/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: params.requestId,
        laterConfirmedDuplicate,
        userAction: params.userAction,
      }),
    });
    if (!response.ok) throw new Error(params.failedMessage);
    toast.success(params.savedMessage);
  };

  const handle = (laterConfirmedDuplicate: boolean) => {
    void submit(laterConfirmedDuplicate).catch(() => {
      toast.error(params.failedMessage);
    });
  };

  toast.info(params.question, {
    duration: 20_000,
    action: {
      label: params.duplicateLabel,
      onClick: () => handle(true),
    },
    cancel: {
      label: params.distinctLabel,
      onClick: () => handle(false),
    },
  });
};
