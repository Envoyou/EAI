import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db';
import { redisConnection, aiQueue } from '../lib/queue';
import { r2Client } from '../lib/r2';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fetchWithTimeout } from '../lib/fetch-with-timeout';

const router = Router();
const startedAt = new Date().toISOString();

// Cache version and git commit to avoid reading filesystem/running process on every call
let version = '3.0.3';
try {
  let packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    packageJsonPath = path.join(__dirname, '../package.json');
    if (!fs.existsSync(packageJsonPath)) {
      packageJsonPath = path.join(__dirname, '../../package.json');
    }
  }
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = packageJson.version;
  }
} catch {
  // Use fallback
}

let commit = 'unknown';
if (process.env.RAILWAY_GIT_COMMIT_SHA) {
  commit = process.env.RAILWAY_GIT_COMMIT_SHA;
} else {
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Use fallback
  }
}

const TIMEOUT_MS = 3000;

/**
 * Wraps a promise with a timeout. Rejects if the promise takes longer than timeoutMs.
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, serviceName: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: ${serviceName} failed to respond within ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise,
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Shallow Health Check  GET /health
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  if (req.baseUrl === '/health') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version,
    });
  }
  next();
});

interface ServiceHealth {
  status: string;
  critical: boolean;
  latencyMs: number;
  error?: string;
  provider?: string;
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deep Health Check  GET /api/health  (and /api/health/deep)
//
// Checks all infrastructure dependencies in parallel with a 3 s timeout each.
// Critical failures → HTTP 503. Non-critical failures → HTTP 200 (degraded).
// ─────────────────────────────────────────────────────────────────────────────
const deepHealthHandler = async (_req: Request, res: Response) => {
  const start = Date.now();
  const activeProvider = (process.env.ACTIVE_AI_PROVIDER || 'gemini').trim().toLowerCase();

  // A. Database (Neon / PostgreSQL)
  const checkDatabase = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, TIMEOUT_MS, 'Database');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: true, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // B. Redis
  const checkRedis = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    try {
      const pong = await withTimeout(redisConnection.ping(), TIMEOUT_MS, 'Redis');
      if (pong !== 'PONG') throw new Error(`Unexpected ping response: ${pong}`);
      return { status: 'healthy', critical: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: true, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // C. BullMQ Worker — separate process from the API server
  // Critical only in production; dev typically runs without the worker process.
  const checkWorker = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    const isProduction = process.env.NODE_ENV === 'production';
    try {
      const [workers, isPaused] = await withTimeout(
        Promise.all([aiQueue.getWorkers(), aiQueue.isPaused()]),
        TIMEOUT_MS,
        'BullMQ Worker'
      );
      if (isPaused) throw new Error('AI processing queue is paused');
      const count = workers.length;
      return {
        status: count > 0 ? 'healthy' : 'unhealthy',
        critical: isProduction,
        latencyMs: Date.now() - t,
        detail: count > 0 ? `${count} active worker(s)` : 'No active workers detected',
      };
    } catch (err) {
      return { status: 'unhealthy', critical: isProduction, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // D. Clerk Auth
  const checkClerk = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    if (!process.env.CLERK_SECRET_KEY) return { status: 'not_configured', critical: true, latencyMs: 0 };
    try {
      const r = await withTimeout(
        fetchWithTimeout('https://api.clerk.com/v1/instance', {
          timeoutMs: TIMEOUT_MS,
          headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, Accept: 'application/json' },
        }),
        TIMEOUT_MS, 'Clerk'
      );
      if (!r.ok) throw new Error(`Clerk API responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: true, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // E. Storage (Cloudflare R2)
  const checkStorage = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'eai-insight';
    if (!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
      return { status: 'not_configured', critical: true, latencyMs: 0 };
    }
    try {
      await withTimeout(r2Client.send(new HeadBucketCommand({ Bucket: bucket })), TIMEOUT_MS, 'Storage');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: true, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // F. Gemini (model metadata — no generation)
  const checkGemini = async (isCritical: boolean): Promise<ServiceHealth> => {
    const t = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'empty') return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    try {
      const r = await withTimeout(
        fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${apiKey}`, { timeoutMs: TIMEOUT_MS }),
        TIMEOUT_MS, 'Gemini'
      );
      if (!r.ok) throw new Error(`Gemini API responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: isCritical, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // G. OpenRouter (auth key metadata)
  const checkOpenRouter = async (isCritical: boolean): Promise<ServiceHealth> => {
    const t = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'empty') return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    try {
      const r = await withTimeout(
        fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: TIMEOUT_MS }),
        TIMEOUT_MS, 'OpenRouter'
      );
      if (!r.ok) throw new Error(`OpenRouter API responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: isCritical, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // H. Groq (model list)
  const checkGroq = async (isCritical: boolean): Promise<ServiceHealth> => {
    const t = Date.now();
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'empty') return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    try {
      const r = await withTimeout(
        fetchWithTimeout('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: TIMEOUT_MS }),
        TIMEOUT_MS, 'Groq'
      );
      if (!r.ok) throw new Error(`Groq API responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: isCritical, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // I. Midtrans (dummy order lookup — 404 = credentials valid, server reachable)
  const checkMidtrans = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return { status: 'not_configured', critical: false, latencyMs: 0 };
    if (process.env.MIDTRANS_ENABLE_SIMULATOR === 'true') return { status: 'simulated', critical: false, latencyMs: 0 };
    try {
      // Auto-detect sandbox mode if key starts with SB- or if IS_PRODUCTION is false
      const isSandbox = serverKey.startsWith('SB-') || process.env.MIDTRANS_IS_PRODUCTION !== 'true';
      const base = isSandbox ? 'https://api.sandbox.midtrans.com' : 'https://api.midtrans.com';
      const auth = Buffer.from(`${serverKey}:`).toString('base64');
      const r = await withTimeout(
        fetchWithTimeout(`${base}/v2/healthcheck-ping-dummy/status`, {
          timeoutMs: TIMEOUT_MS,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        }),
        TIMEOUT_MS, 'Midtrans'
      );

      // Fallback: If 401/403 on production, try sandbox in case it's a sandbox key without SB- prefix
      if ((r.status === 401 || r.status === 403) && !isSandbox) {
        try {
          const fallbackBase = 'https://api.sandbox.midtrans.com';
          const fallbackR = await withTimeout(
            fetchWithTimeout(`${fallbackBase}/v2/healthcheck-ping-dummy/status`, {
              timeoutMs: TIMEOUT_MS,
              headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            }),
            TIMEOUT_MS, 'Midtrans Sandbox Fallback'
          );
          if (fallbackR.status === 404 || fallbackR.status === 200) {
            return {
              status: 'healthy',
              critical: false,
              latencyMs: Date.now() - t,
              detail: 'sandbox mode (fallback)'
            };
          }
        } catch {
          // Ignore fallback error and proceed to handle the original error
        }
      }

      if (r.status === 404 || r.status === 200) {
        return {
          status: 'healthy',
          critical: false,
          latencyMs: Date.now() - t,
          detail: isSandbox ? 'sandbox mode' : 'production mode'
        };
      }
      if (r.status === 401 || r.status === 403) throw new Error(`Midtrans auth failed (HTTP ${r.status})`);
      throw new Error(`Midtrans API responded with HTTP ${r.status}`);
    } catch (err) {
      return { status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // J. Email (Mailgun or Resend)
  const checkEmail = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    if (process.env.MAILGUN_API_KEY) {
      try {
        const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
        const r = await withTimeout(
          fetchWithTimeout('https://api.mailgun.net/v3/domains', { headers: { Authorization: `Basic ${auth}` }, timeoutMs: TIMEOUT_MS }),
          TIMEOUT_MS, 'Mailgun'
        );
        if (r.ok) return { provider: 'mailgun', status: 'healthy', critical: false, latencyMs: Date.now() - t };
        throw new Error(`Mailgun API returned HTTP ${r.status}`);
      } catch (err) {
        return { provider: 'mailgun', status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
      }
    }
    if (process.env.RESEND_API_KEY) {
      try {
        const r = await withTimeout(
          fetchWithTimeout('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeoutMs: TIMEOUT_MS }),
          TIMEOUT_MS, 'Resend'
        );
        if (r.ok) return { provider: 'resend', status: 'healthy', critical: false, latencyMs: Date.now() - t };
        throw new Error(`Resend API returned HTTP ${r.status}`);
      } catch (err) {
        return { provider: 'resend', status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
      }
    }
    return { status: 'not_configured', critical: false, latencyMs: 0 };
  };

  // K. Vercel Edge Config (Feature Flags)
  const checkEdgeConfig = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    const edgeConfigConnection = process.env.EDGE_CONFIG;
    if (edgeConfigConnection) {
      try {
        // Query the connection string directly since it contains the read-only token
        const r = await withTimeout(
          fetchWithTimeout(edgeConfigConnection, { timeoutMs: TIMEOUT_MS }),
          TIMEOUT_MS,
          'Edge Config'
        );
        if (!r.ok) throw new Error(`Edge Config responded with HTTP ${r.status}`);
        return { status: 'healthy', critical: false, latencyMs: Date.now() - t };
      } catch (err) {
        return { status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
      }
    }

    const edgeConfigId = process.env.EDGE_CONFIG_ID;
    const vercelToken = process.env.VERCEL_API_TOKEN;
    if (!edgeConfigId || !vercelToken) return { status: 'not_configured', critical: false, latencyMs: 0 };
    try {
      const r = await withTimeout(
        fetchWithTimeout(`https://edge-config.vercel.com/${edgeConfigId}/items?limit=1`, {
          timeoutMs: TIMEOUT_MS,
          headers: { Authorization: `Bearer ${vercelToken}` },
        }),
        TIMEOUT_MS, 'Edge Config'
      );
      if (!r.ok) throw new Error(`Edge Config responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: false, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // L. Exchange Rate API (USD/IDR for Midtrans checkout pricing)
  const checkExchangeRate = async (): Promise<ServiceHealth> => {
    const t = Date.now();
    try {
      const r = await withTimeout(fetchWithTimeout('https://open.er-api.com/v6/latest/USD', { timeoutMs: TIMEOUT_MS }), TIMEOUT_MS, 'Exchange Rate');
      if (!r.ok) throw new Error(`Exchange rate API responded with HTTP ${r.status}`);
      return { status: 'healthy', critical: false, latencyMs: Date.now() - t };
    } catch (err) {
      return { status: 'unhealthy', critical: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t };
    }
  };

  // Run all dependency checks in parallel
  const [db, redis, worker, clerk, storage, gemini, openrouter, groq, midtrans, email, edgeConfig, exchangeRate] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkWorker(),
      checkClerk(),
      checkStorage(),
      checkGemini(activeProvider === 'gemini'),
      checkOpenRouter(activeProvider === 'openrouter'),
      checkGroq(activeProvider === 'groq'),
      checkMidtrans(),
      checkEmail(),
      checkEdgeConfig(),
      checkExchangeRate(),
    ]);

  const services: Record<string, ServiceHealth> = {
    database: db,
    redis,
    worker,
    clerk,
    storage,
    gemini,
    openrouter,
    groq,
    midtrans,
    email,
    edgeConfig,
    exchangeRate,
  };

  // Determine overall status
  const serviceEntries = Object.entries(services);
  const failedCritical = serviceEntries.filter(([_, s]) => s.status === 'unhealthy' && s.critical);
  const failedNonCritical = serviceEntries.filter(([_, s]) => s.status === 'unhealthy' && !s.critical);

  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
  if (failedCritical.length > 0) overallStatus = 'error';
  else if (failedNonCritical.length > 0) overallStatus = 'degraded';

  const payload = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    version,
    commit,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: process.uptime(),
    startedAt,
    services,
  };

  return res.status(overallStatus === 'error' ? 503 : 200).json(payload);
};

router.get('/deep', deepHealthHandler);
router.get('/', deepHealthHandler);

// ─────────────────────────────────────────────────────────────────────────────
// 3. User Journey Health Check  GET /api/health/journey
//
// Mirrors the real EAI user workflow end-to-end:
//
//   Step 1 · Pre-Analysis   → Strategist Chat, Generate Plan,
//                             Generate Draft from Notes, Quick Draft
//   Step 2 · Workspace      → Load state & config
//   Step 3 · AI Analysis    → Submit content → editorial analysis
//   Step 4 · In-Editor      → Inline AI actions (fix, rephrase, expand, etc.)
//   Step 5 · History        → Retrieve past analyses
//   Step 6 · Export         → Push result to CMS or download
//   Step 7 · Subscription   → Subscription status & checkout
//
// Auth-protected routes are probed without a token.
//   401 = route registered, auth middleware active → reachable ✅
//   5xx / timeout = handler crashed or process unreachable → unreachable ❌
// ─────────────────────────────────────────────────────────────────────────────
interface JourneyCheck {
  status: 'reachable' | 'unreachable';
  httpStatus?: number;
  latencyMs: number;
  error?: string;
}

const journeyHealthHandler = async (_req: Request, res: Response) => {
  const start = Date.now();

  const apiBase = process.env.BACKEND_INTERNAL_URL || `http://localhost:${process.env.PORT || 5001}`;
  const frontendBase = process.env.FRONTEND_URL || 'https://eai.envoyou.com';

  /**
   * Probes an API route without auth credentials.
   *   expectedStatus 401 → protected route alive (requireAuth middleware)
   *   expectedStatus 403 → route alive but blocked by rate limiter or softAuth
   *   expectedStatus 200 → public route responding normally
   * Only 5xx / connection error / timeout counts as unhealthy.
   * Pass multiple acceptable statuses as a Set via acceptedStatuses.
   */
  const checkApi = async (
    label: string,
    urlPath: string,
    method: 'GET' | 'POST' = 'GET',
    acceptedStatuses: number[] = [401]
  ): Promise<JourneyCheck> => {
    const t = Date.now();
    try {
      const r = await withTimeout(fetchWithTimeout(`${apiBase}${urlPath}`, { method, timeoutMs: TIMEOUT_MS }), TIMEOUT_MS, label);
      const ok = acceptedStatuses.includes(r.status);
      return {
        status: ok ? 'reachable' : 'unreachable',
        httpStatus: r.status,
        latencyMs: Date.now() - t,
        ...(!ok ? { error: `Expected HTTP [${acceptedStatuses.join('|')}], got ${r.status}` } : {}),
      };
    } catch (err) {
      return { status: 'unreachable', latencyMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
    }
  };

  /**
   * Probes a public frontend page. Expects HTTP 200.
   * Follows redirects (default fetch behavior).
   */
  const checkFrontend = async (label: string, urlPath: string): Promise<JourneyCheck> => {
    const t = Date.now();
    try {
      const r = await withTimeout(fetchWithTimeout(`${frontendBase}${urlPath}`, { timeoutMs: TIMEOUT_MS }), TIMEOUT_MS, label);
      return {
        status: r.ok ? 'reachable' : 'unreachable',
        httpStatus: r.status,
        latencyMs: Date.now() - t,
        ...(!r.ok ? { error: `HTTP ${r.status}` } : {}),
      };
    } catch (err) {
      return { status: 'unreachable', latencyMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // All probes run in parallel — order in destructuring matches Promise.all order
  const [
    // ── Step 0: Onboarding ───────────────────────────────────────────────────
    onboarding,               // Fetch onboarding status for new user (GET → 401)
    // ── Step 1: Pre-Analysis — Strategist ────────────────────────────────────
    strategistChat,           // AI Chat assistant (softAuth → 401/403 without token)
    strategistSessions,       // Strategist sessions list (GET, requireAuth → 401)
    strategistGenerateDraft,  // Generate full draft from notes (public → 200)
    strategistQuickDraft,     // Quick draft shortcut (softAuth → 401/403)
    // ── Step 2: Workspace Setup ──────────────────────────────────────────────
    workspaceState,           // Load active workspace state for the user
    workspaceConfig,          // Load workspace configuration & preferences
    // ── Step 3: AI Analysis ──────────────────────────────────────────────────
    analyze,                  // Submit article → receive AI editorial analysis
    // ── Step 4: In-Editor AI Action ──────────────────────────────────────────
    editorAiAction,           // Inline AI actions (fix, rephrase, expand, SEO)
    // ── Step 5: History ──────────────────────────────────────────────────────
    history,                  // Retrieve list of past analyses
    // ── Step 6: Export ───────────────────────────────────────────────────────
    exportRoute,              // Export analysis to CMS or download
    // ── Step 7: Subscription & Payment ───────────────────────────────────────
    paymentsStatus,           // Check active subscription tier & expiry
    checkout,                 // Initiate new subscription checkout (Midtrans)
    // ── Infra: Frontend pages (/ returns 404, monitor locale-specific pages) ──
    frontendLogin,
    frontendPricing,
    // ── Infra: Public API ────────────────────────────────────────────────────
    publicStats,
  ] = await Promise.all([
    checkApi('Onboarding',                   '/api/onboarding',                          'GET',  [401]),

    // softAuth routes: 401 (no token) or 403 (rate limiter) both mean route is alive
    checkApi('Strategist / Chat',            '/api/strategist/chat',                     'POST', [401, 403]),
    // generate-plan is pure SSE — headers only arrive after stream ends, skip it
    // Monitor /sessions instead: same auth gate, responds immediately
    checkApi('Strategist / Sessions',        '/api/strategist/sessions',                 'GET',  [401]),
    // generate-draft-from-notes is public — no auth required
    checkApi('Strategist / Generate Draft',  '/api/strategist/generate-draft-from-notes', 'POST', [200, 400, 401, 403]),
    checkApi('Strategist / Quick Draft',     '/api/strategist/quick-draft',               'POST', [401, 403]),

    checkApi('Workspace / State',            '/api/workspace/state',   'GET',  [401]),
    checkApi('Workspace / Config',           '/api/workspace/config',  'GET',  [401]),

    checkApi('Analyze',                      '/api/analyze',           'POST', [401, 403]),

    checkApi('Editor / AI Action',           '/api/editor/ai-action',  'POST', [401]),

    checkApi('History',                      '/api/history',           'GET',  [401]),

    checkApi('Export',                       '/api/export',            'POST', [401]),

    checkApi('Payments / Status',            '/api/payments/status',   'GET',  [401]),
    checkApi('Checkout',                     '/api/checkout',          'POST', [401]),

    // frontend.home (/) returns 404 — root redirects to locale-specific path
    // We monitor /en/login as the primary landing page for unauthenticated users
    checkFrontend('Frontend / Login',   '/en/login'),
    checkFrontend('Frontend / Pricing', '/en/pricing'),

    // public-stats may require auth depending on environment
    checkApi('Public Stats',                 '/api/public-stats',      'GET',  [200, 401]),
  ]);

  const journeys: Record<string, JourneyCheck> = {
    // Step 0 — Onboarding
    'onboarding':               onboarding,
    // Step 1 — Pre-Analysis
    'strategist.chat':          strategistChat,
    'strategist.sessions':      strategistSessions,
    'strategist.generateDraft': strategistGenerateDraft,
    'strategist.quickDraft':    strategistQuickDraft,
    // Step 2 — Workspace
    'workspace.state':          workspaceState,
    'workspace.config':         workspaceConfig,
    // Step 3 — AI Analysis
    'analyze':                  analyze,
    // Step 4 — In-Editor
    'editor.aiAction':          editorAiAction,
    // Step 5 — History
    'history':                  history,
    // Step 6 — Export
    'export':                   exportRoute,
    // Step 7 — Subscription
    'payments.status':          paymentsStatus,
    'checkout':                 checkout,
    // Infra — Frontend (/ returns 404, monitor /en/login as primary entry point)
    'frontend.login':           frontendLogin,
    'frontend.pricing':         frontendPricing,
    // Infra — Public API
    'api.publicStats':          publicStats,
  };

  const unreachableCount = Object.values(journeys).filter(j => j.status === 'unreachable').length;
  const overallStatus = unreachableCount === 0 ? 'ok' : unreachableCount <= 2 ? 'degraded' : 'error';

  return res.status(overallStatus === 'error' ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    version,
    environment: process.env.NODE_ENV || 'development',
    journeys,
  });
};

router.get('/journey', journeyHealthHandler);

export default router;
