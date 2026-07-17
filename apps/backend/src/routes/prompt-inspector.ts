import { Router, Request, Response } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { ENVOYOU_EDITORIAL_PROFILE, normalizeProfileConfig } from '@eai/shared/server';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { ReviewPromptComposer } from '@/lib/ai/prompt-engine/composer/review-composer';
import { RewritePromptComposer } from '@/lib/ai/prompt-engine/composer/rewrite-composer';
import { RefinementPromptComposer } from '@/lib/ai/prompt-engine/composer/refinement-composer';
import { QualityGatePromptComposer } from '@/lib/ai/prompt-engine/composer/quality-gate-composer';
import { PromptCachePlanner } from '@/lib/ai/prompt-engine/cache-planner';
import { PromptCacheOptimizer } from '@/lib/ai/prompt-engine/cache-optimizer';
import { PromptTokenEstimator } from '@/lib/ai/prompt-engine/token-estimator';
import { estimateCost } from '@/lib/ai/prompt-engine/pricing';
import { getProvider } from '@/lib/ai/providers/registry';
import { resolveModel, resolveOutputLimit } from '@/lib/ai/model-router';
import type { Role } from '@eai/shared';

const router = Router();

interface ComposerOptions {
  isChunkMode?: boolean;
  publishedPosts?: { title: string; slug: string }[];
  format?: 'xml' | 'markdown' | 'text';
  targetLanguage?: 'en' | 'id' | 'follow_draft';
}

interface PromptInspectorRequestBody {
  composer?: string;
  provider?: 'gemini' | 'groq' | 'openrouter';
  analysisSpeed?: 'fast' | 'balanced' | 'deep';
  role?: string;
  workspaceId?: string;
  options?: ComposerOptions;
}

interface DiffPayload {
  composer: string;
  provider?: 'gemini' | 'groq' | 'openrouter';
  role?: string;
  workspaceId?: string;
  options?: ComposerOptions;
}

interface DiffRequestBody {
  source?: DiffPayload;
  target?: DiffPayload;
}

async function getProfileConfig(workspaceId?: string): Promise<EditorialProfileConfig> {
  if (!workspaceId) return ENVOYOU_EDITORIAL_PROFILE.config;
  
  const organization = await prisma.organization.findUnique({
    where: { id: workspaceId },
    select: {
      profiles: {
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              config: true,
            },
          },
        },
      },
    },
  });
  
  const config = organization?.profiles[0]?.versions[0]?.config;
  if (config) {
    const normalized = normalizeProfileConfig(config);
    if (normalized) return normalized;
  }
  return ENVOYOU_EDITORIAL_PROFILE.config;
}

function instantiateComposer(
  composerName: string,
  config: EditorialProfileConfig,
  provider: string,
  role: string,
  options: ComposerOptions
) {
  switch (composerName) {
    case 'seo':
      return new SeoPromptComposer(config);
    case 'review':
      return new ReviewPromptComposer(role as Role | 'polish', config, {
        includeTextSchema: provider !== 'gemini',
      });
    case 'rewrite':
      return new RewritePromptComposer(config, {
        isChunkMode: !!options.isChunkMode,
        publishedPosts: options.publishedPosts || [],
      });
    case 'refinement':
      return new RefinementPromptComposer(role === 'targeted_fix' ? 'targeted_fix' : 'iterative', config);
    case 'quality-gate':
      return new QualityGatePromptComposer(config, {
        includeTextSchema: provider !== 'gemini',
      });
    default:
      throw new Error(`Unknown composer: "${composerName}"`);
  }
}

export async function handleInspect(req: Request, res: Response): Promise<Response> {
  try {
    const {
      composer: composerName,
      provider = 'gemini',
      analysisSpeed = 'balanced',
      role = 'polish',
      workspaceId,
      options = {},
    } = req.body as PromptInspectorRequestBody;

    if (!composerName) {
      return res.status(400).json({ error: 'Missing parameter: "composer"' });
    }

    const profileConfig = await getProfileConfig(workspaceId);
    const composerNode = instantiateComposer(composerName, profileConfig, provider, role, options);

    const context = {
      format: (options.format || 'xml') as 'xml' | 'markdown' | 'text',
      today: new Date().toISOString().split('T')[0],
      targetLanguage: (options.targetLanguage || 'en') as 'en' | 'id' | 'follow_draft',
    };

    const renderedPrompt = composerNode.compose(context.format);
    const model = resolveModel(provider, role as Role | 'polish', analysisSpeed);
    const outputLimit = resolveOutputLimit(provider, role as Role | 'polish', 'standard');

    // Run Planner
    const rootNode = composerNode.compile(context.format);
    const cacheReport = PromptCachePlanner.plan(rootNode, context);

    // Run Optimizer
    const providerCapabilities = getProvider(provider).getCapabilities();
    const optimizeReport = PromptCacheOptimizer.optimize(cacheReport, providerCapabilities.cachePolicy);

    // Online precise calculation (Gemini-only, cached)
    let onlinePreciseTokens: number | null = null;
    if (provider === 'gemini') {
      try {
        onlinePreciseTokens = await PromptTokenEstimator.estimateOnlineCached(renderedPrompt, provider, model);
      } catch (_err) {
        // Fall back gracefully
      }
    }

    const finalTotalTokens = onlinePreciseTokens ?? cacheReport.totalTokens;
    const finalCachedTokens = onlinePreciseTokens 
      ? Math.round(onlinePreciseTokens * (cacheReport.cacheableTokens / cacheReport.totalTokens))
      : cacheReport.cacheableTokens;

    // Cost estimation
    const cost = estimateCost(model, finalTotalTokens, outputLimit, finalCachedTokens);

    return res.json({
      renderedPrompt,
      model,
      tree: cacheReport.nodeStats,
      tokenBreakdown: cacheReport.nodeStats.reduce((acc: Record<string, number>, s) => {
        acc[s.id] = s.estimatedTokens;
        return acc;
      }, {}),
      cacheAnalysis: {
        totalTokens: finalTotalTokens,
        cacheableTokens: finalCachedTokens,
        dynamicTokens: finalTotalTokens - finalCachedTokens,
        efficiency: cacheReport.efficiency,
        hasOrderViolation: cacheReport.hasOrderViolation,
        recommendations: optimizeReport.recommendations,
      },
      provider,
      estimatedCost: cost,
    });
  } catch (error) {
    console.error('[PromptInspector API] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

export async function handleDiff(req: Request, res: Response): Promise<Response> {
  try {
    const { source, target } = req.body as DiffRequestBody;
    if (!source || !target) {
      return res.status(400).json({ error: 'Both "source" and "target" config payloads are required' });
    }

    const fetchInspectData = async (payload: DiffPayload) => {
      const config = await getProfileConfig(payload.workspaceId);
      const composerNode = instantiateComposer(
        payload.composer,
        config,
        payload.provider || 'gemini',
        payload.role || 'polish',
        payload.options || {}
      );
      const context = {
        format: (payload.options?.format || 'xml') as 'xml' | 'markdown' | 'text',
        today: new Date().toISOString().split('T')[0],
        targetLanguage: (payload.options?.targetLanguage || 'en') as 'en' | 'id' | 'follow_draft',
      };
      const rendered = composerNode.compose(context.format);
      const rootNode = composerNode.compile(context.format);
      const plan = PromptCachePlanner.plan(rootNode, context);
      return { rendered, plan };
    };

    const sourceData = await fetchInspectData(source);
    const targetData = await fetchInspectData(target);

    const totalTokenDiff = targetData.plan.totalTokens - sourceData.plan.totalTokens;
    const cacheableTokenDiff = targetData.plan.cacheableTokens - sourceData.plan.cacheableTokens;

    // Node-by-node comparison
    const nodeDiffs: Record<string, { source: number; target: number; delta: number }> = {};
    const sourceMap = sourceData.plan.nodeStats.reduce((acc: Record<string, number>, s) => { acc[s.id] = s.estimatedTokens; return acc; }, {});
    const targetMap = targetData.plan.nodeStats.reduce((acc: Record<string, number>, s) => { acc[s.id] = s.estimatedTokens; return acc; }, {});

    const allIds = new Set([...Object.keys(sourceMap), ...Object.keys(targetMap)]);
    for (const id of allIds) {
      const srcVal = sourceMap[id] || 0;
      const tgtVal = targetMap[id] || 0;
      if (srcVal !== tgtVal) {
        nodeDiffs[id] = { source: srcVal, target: tgtVal, delta: tgtVal - srcVal };
      }
    }

    return res.json({
      totalTokenDiff,
      cacheableTokenDiff,
      nodeDiffs,
    });
  } catch (error) {
    console.error('[PromptInspector API Diff] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

router.post('/', requireAuth, handleInspect);
router.post('/diff', requireAuth, handleDiff);

export default router;
