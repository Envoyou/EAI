/**
 * Returns strategist API paths for directFetch.
 * directFetch prepends getApiUrl() internally and handles Auth headers.
 */
export function isMockChatEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_CHAT === 'true';
}

export function getStrategistChatPath(): string {
  const isMock = isMockChatEnabled();

  if (isMock && process.env.NODE_ENV === 'development') {
    console.info('[Strategist] 🟡 Mock SSE active → /api/strategist/mock-chat');
  }

  return isMock ? '/api/strategist/mock-chat' : '/api/strategist/chat';
}

export function getStrategistStatusPath(interactionId: string): string {
  const isMock = isMockChatEnabled();
  const encodedId = encodeURIComponent(interactionId);
  return isMock
    ? `/api/strategist/mock-chat/status/${encodedId}`
    : `/api/strategist/chat/status/${encodedId}`;
}

export function getStrategistCancelPath(interactionId: string): string {
  const isMock = isMockChatEnabled();
  const encodedId = encodeURIComponent(interactionId);
  return isMock
    ? `/api/strategist/mock-chat/status/${encodedId}/cancel`
    : `/api/strategist/chat/status/${encodedId}/cancel`;
}
