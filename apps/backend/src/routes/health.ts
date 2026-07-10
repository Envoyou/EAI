import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db';
import { redisConnection } from '../lib/queue';
import { r2Client } from '../lib/r2';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const router = Router();
const startedAt = new Date().toISOString();

// Cache version and git commit to avoid reading filesystem/running process on every call
let version = '3.0.3';
try {
  let packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    // Fallback: search relative to __dirname (handles both src/routes/ and dist/ structures)
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

/**
 * Helper to wrap a promise in a timeout.
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
    timeoutPromise
  ]);
};

// 1. Shallow Health Check (Process & Express status)
router.get('/', (req, res, next) => {
  // If this is hit via GET /health (shallow) rather than GET /api/health (deep)
  if (req.baseUrl === '/health') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version
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
}

const deepHealthHandler = async (req: Request, res: Response) => {
  const start = Date.now();
  const activeProvider = (process.env.ACTIVE_AI_PROVIDER || 'gemini').trim().toLowerCase();

  // A. Database Check (Prisma)
  const checkDatabase = async () => {
    const dbStart = Date.now();
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, 'Database');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - dbStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: true,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - dbStart
      };
    }
  };

  // B. Redis Check
  const checkRedis = async () => {
    const redisStart = Date.now();
    try {
      const pingPromise = redisConnection.ping().then((pong) => {
        if (pong !== 'PONG') throw new Error(`Unexpected ping response: ${pong}`);
        return pong;
      });
      await withTimeout(pingPromise, 3000, 'Redis');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - redisStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: true,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - redisStart
      };
    }
  };

  // C. Clerk Check
  const checkClerk = async () => {
    const clerkStart = Date.now();
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: 'not_configured', critical: true, latencyMs: 0 };
    }
    try {
      const fetchPromise = fetch('https://api.clerk.com/v1/instance', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
          Accept: 'application/json'
        }
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Clerk API responded with HTTP ${response.status}`);
        }
        return response;
      });
      await withTimeout(fetchPromise, 3000, 'Clerk');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - clerkStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: true,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - clerkStart
      };
    }
  };

  // D. Storage Check (Cloudflare R2 - HeadBucket)
  const checkStorage = async () => {
    const storageStart = Date.now();
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'eai-insight';
    if (!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
      return { status: 'not_configured', critical: true, latencyMs: 0 };
    }
    try {
      const storagePromise = r2Client.send(new HeadBucketCommand({ Bucket: bucket }));
      await withTimeout(storagePromise, 3000, 'Storage');
      return { status: 'healthy', critical: true, latencyMs: Date.now() - storageStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: true,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - storageStart
      };
    }
  };

  // E. Gemini Check
  const checkGemini = async (isCritical: boolean) => {
    const geminiStart = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'empty') {
      return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    }
    try {
      const fetchPromise = fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite?key=${apiKey}`
      ).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Gemini API responded with HTTP ${response.status}`);
        }
        return response;
      });
      await withTimeout(fetchPromise, 3000, 'Gemini');
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - geminiStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: isCritical,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - geminiStart
      };
    }
  };

  // F. OpenRouter Check
  const checkOpenRouter = async (isCritical: boolean) => {
    const orStart = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'empty') {
      return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    }
    try {
      const fetchPromise = fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`OpenRouter API responded with HTTP ${response.status}`);
        }
        return response;
      });
      await withTimeout(fetchPromise, 3000, 'OpenRouter');
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - orStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: isCritical,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - orStart
      };
    }
  };

  // G. Groq Check
  const checkGroq = async (isCritical: boolean) => {
    const groqStart = Date.now();
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'empty') {
      return { status: 'not_configured', critical: isCritical, latencyMs: 0 };
    }
    try {
      const fetchPromise = fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Groq API responded with HTTP ${response.status}`);
        }
        return response;
      });
      await withTimeout(fetchPromise, 3000, 'Groq');
      return { status: 'healthy', critical: isCritical, latencyMs: Date.now() - groqStart };
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: isCritical,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - groqStart
      };
    }
  };

  // H. Midtrans Check
  const checkMidtrans = async () => {
    const midtransStart = Date.now();
    if (!process.env.MIDTRANS_SERVER_KEY) {
      return { status: 'not_configured', critical: false, latencyMs: 0 };
    }
    if (process.env.MIDTRANS_ENABLE_SIMULATOR === 'true') {
      return { status: 'simulated', critical: false, latencyMs: Date.now() - midtransStart };
    }
    try {
      const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
      const apiBaseUrl = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
      const authHeader = Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString('base64');

      const fetchPromise = fetch(`${apiBaseUrl}/v2/healthcheck-ping-dummy/status`, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`
        }
      });

      const response = await withTimeout(fetchPromise, 3000, 'Midtrans');
      if (response.status === 404 || response.status === 200) {
        return { status: 'healthy', critical: false, latencyMs: Date.now() - midtransStart };
      } else if (response.status === 401 || response.status === 403) {
        throw new Error(`Midtrans authentication failed (HTTP ${response.status})`);
      } else {
        throw new Error(`Midtrans API responded with HTTP ${response.status}`);
      }
    } catch (err) {
      return {
        status: 'unhealthy',
        critical: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - midtransStart
      };
    }
  };

  // I. Email Check (Mailgun or Resend)
  const checkEmail = async () => {
    const emailStart = Date.now();
    if (process.env.MAILGUN_API_KEY) {
      try {
        const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
        const fetchPromise = fetch('https://api.mailgun.net/v3/domains', {
          headers: { Authorization: `Basic ${auth}` }
        });
        const res = await withTimeout(fetchPromise, 3000, 'Mailgun');
        if (res.ok) {
          return { provider: 'mailgun', status: 'healthy', critical: false, latencyMs: Date.now() - emailStart };
        } else {
          throw new Error(`Mailgun API returned HTTP ${res.status}`);
        }
      } catch (err) {
        return {
          provider: 'mailgun',
          status: 'unhealthy',
          critical: false,
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - emailStart
        };
      }
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const fetchPromise = fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
        });
        const res = await withTimeout(fetchPromise, 3000, 'Resend');
        if (res.ok) {
          return { provider: 'resend', status: 'healthy', critical: false, latencyMs: Date.now() - emailStart };
        } else {
          throw new Error(`Resend API returned HTTP ${res.status}`);
        }
      } catch (err) {
        return {
          provider: 'resend',
          status: 'unhealthy',
          critical: false,
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - emailStart
        };
      }
    }

    return { status: 'not_configured', critical: false, latencyMs: 0 };
  };

  // Run all checks in parallel
  const [db, redis, clerk, storage, gemini, openrouter, groq, midtrans, email] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkClerk(),
    checkStorage(),
    checkGemini(activeProvider === 'gemini'),
    checkOpenRouter(activeProvider === 'openrouter'),
    checkGroq(activeProvider === 'groq'),
    checkMidtrans(),
    checkEmail()
  ]);

  const services: Record<string, ServiceHealth> = {
    database: db,
    redis,
    clerk,
    storage,
    gemini,
    openrouter,
    groq,
    midtrans,
    email
  };

  // Determine overall status
  const serviceEntries = Object.entries(services);
  const failedCritical = serviceEntries.filter(([_, s]) => s.status === 'unhealthy' && s.critical);
  const failedNonCritical = serviceEntries.filter(([_, s]) => s.status === 'unhealthy' && !s.critical);

  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
  if (failedCritical.length > 0) {
    overallStatus = 'error';
  } else if (failedNonCritical.length > 0) {
    overallStatus = 'degraded';
  }

  const responsePayload = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    version,
    commit,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: process.uptime(),
    startedAt,
    services
  };

  if (overallStatus === 'error') {
    return res.status(503).json(responsePayload);
  } else {
    return res.status(200).json(responsePayload);
  }
};

router.get('/deep', deepHealthHandler);

// If hit via GET /api/health directly
router.get('/', deepHealthHandler);

export default router;
