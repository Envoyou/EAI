'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { isFeatureFlagKey } from '@eai/shared';

type ToggleFeatureFlagResult =
  | {
      success: true;
      mocked: boolean;
      message: string;
    }
  | {
      success: false;
      mocked: false;
      message: string;
      code: 'invalid_token' | 'forbidden' | 'not_found' | 'vercel_api_error';
    };

const getVercelError = async (response: Response) => {
  try {
    return (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        invalidToken?: boolean;
      };
    };
  } catch {
    return {};
  }
};

export async function toggleFeatureFlag(
  key: string,
  newValue: boolean
): Promise<ToggleFeatureFlagResult> {
  const authContext = await auth();
  const { userId } = authContext;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const ownerUserIds = process.env.OWNER_USER_IDS || '';
  const isSuperAdmin = ownerUserIds.split(',').map(s => s.trim()).includes(userId);
  if (!isSuperAdmin) {
    throw new Error('Forbidden');
  }
  if (!isFeatureFlagKey(key) || typeof newValue !== 'boolean') {
    throw new Error('Invalid feature flag');
  }

  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const vercelApiToken = process.env.VERCEL_API_TOKEN;
  const vercelTeamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;

  if (!edgeConfigId || !vercelApiToken) {
    console.warn('EDGE_CONFIG_ID or VERCEL_API_TOKEN is missing. Mocking toggle action for local development.');
    return { success: true, mocked: true, message: 'Local/Dummy Mode: Vercel Token not found.' };
  }

  try {
    const endpoint = new URL(
      `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`
    );
    if (vercelTeamId) {
      endpoint.searchParams.set('teamId', vercelTeamId);
    }

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${vercelApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            operation: 'upsert',
            key,
            value: newValue,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseBody = await getVercelError(response);
      const vercelError = responseBody.error;
      console.error('Failed to update edge config:', {
        status: response.status,
        code: vercelError?.code,
        message: vercelError?.message,
        invalidToken: vercelError?.invalidToken,
        hasTeamId: Boolean(vercelTeamId),
      });

      if (vercelError?.invalidToken || response.status === 401) {
        return {
          success: false,
          mocked: false,
          code: 'invalid_token',
          message:
            'VERCEL_API_TOKEN is invalid. Use a Vercel REST API access token, not the read token from EDGE_CONFIG.',
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          mocked: false,
          code: 'forbidden',
          message:
            'The Vercel token cannot update this team Edge Config. Check VERCEL_TEAM_ID or VERCEL_ORG_ID and the token team scope.',
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          mocked: false,
          code: 'not_found',
          message:
            'EDGE_CONFIG_ID was not found for the configured Vercel account or team.',
        };
      }
      return {
        success: false,
        mocked: false,
        code: 'vercel_api_error',
        message:
          vercelError?.message ||
          `Vercel Edge Config update failed with HTTP ${response.status}.`,
      };
    }

    revalidatePath('/settings/system/feature-flags');
    return { success: true, mocked: false, message: 'Feature Flag updated globally via Vercel Edge Config.' };
  } catch (error) {
    console.error('Error toggling feature flag:', error);
    return {
      success: false,
      mocked: false,
      code: 'vercel_api_error',
      message:
        error instanceof Error
          ? `Could not reach the Vercel API: ${error.message}`
          : 'Could not reach the Vercel API.',
    };
  }
}
