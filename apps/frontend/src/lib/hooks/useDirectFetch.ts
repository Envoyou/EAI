'use client';

import { useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { getApiUrl } from '../api-url';
import { fetchWithTimeout, type TimeoutRequestInit } from '../fetch-utils';

export function useDirectFetch() {
  const auth = useAuth();

  const getToken = auth?.getToken;
  const orgId = auth?.orgId;
  const orgSlug = auth?.orgSlug;
  const orgRole = auth?.orgRole;

  const directFetch = useCallback(
    async (path: string, options: TimeoutRequestInit = {}) => {
      const apiBase = getApiUrl();
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = `${apiBase}${cleanPath}`;

      const headers = new Headers(options.headers || {});
      
      if (getToken) {
        try {
          const token = await getToken();
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
        } catch (err) {
          console.warn('Failed to retrieve auth token for direct fetch:', err);
        }
      }
      if (orgId) headers.set('x-clerk-org-id', orgId);
      if (orgSlug) headers.set('x-clerk-org-slug', orgSlug);
      if (orgRole) headers.set('x-clerk-org-role', orgRole);

      return fetchWithTimeout(url, {
        ...options,
        headers,
      });
    },
    [getToken, orgId, orgSlug, orgRole]
  );

  return directFetch;
}
