'use client';

import { useAuth } from '@clerk/nextjs';
import { getApiUrl } from '../api-url';

export function useDirectFetch() {
  const auth = useAuth();

  const directFetch = async (path: string, options: RequestInit = {}) => {
    const apiBase = getApiUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${apiBase}${cleanPath}`;

    const headers = new Headers(options.headers || {});
    
    if (auth) {
      const { getToken, orgId, orgSlug, orgRole } = auth;
      try {
        const token = await getToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch (err) {
        console.warn('Failed to retrieve auth token for direct fetch:', err);
      }
      if (orgId) headers.set('x-clerk-org-id', orgId);
      if (orgSlug) headers.set('x-clerk-org-slug', orgSlug);
      if (orgRole) headers.set('x-clerk-org-role', orgRole);
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  return directFetch;
}
