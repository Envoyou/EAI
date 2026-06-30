import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Import routes
import workspaceRouter from './routes/workspace';
import analyzeRouter from './routes/analyze';
import historyRouter from './routes/history';
import exportRouter from './routes/export';
import publicStatsRouter from './routes/publicStats';
import clerkWebhookRouter from './routes/webhooks/clerk';
import paymentWebhookRouter from './routes/webhooks/payment';
import checkoutRouter from './routes/checkout';
import paymentsRouter from './routes/payments';
import onboardingRouter from './routes/onboarding';
import scrapeRouter from './routes/scrape';
import supportRouter from './routes/support';
import adminRouter from './routes/admin';
import analyticsRouter from './routes/analytics';
import strategistRouter from './routes/strategist';
import strategistQuickDraftRouter from './routes/strategist/quick-draft';
import editorRouter from './routes/editor';
import storageRouter from './routes/storage';

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://eai.envoyou.com',
  'https://envoyou.com',
  'https://blog.envoyou.com',
  'https://eaitest.envoyou.com',
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Express JSON parsing middleware with rawBody capture (critical for webhook verification)
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: true }));

// Health Check
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register routers
app.use('/api/workspace', workspaceRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/history', historyRouter);
app.use('/api/export', exportRouter);
app.use('/api/public-stats', publicStatsRouter);
app.use('/api/webhooks/clerk', clerkWebhookRouter);
app.use('/api/webhooks/payment', paymentWebhookRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/strategist', strategistRouter);
app.use('/api/strategist/quick-draft', strategistQuickDraftRouter);
app.use('/api/editor', editorRouter);
app.use('/api/storage', storageRouter);

// Error Handler
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
});

// Start Server
app.listen(port, () => {
  console.log(`[EAI Backend] Server is running on port ${port} in ${process.env.NODE_ENV || 'development'} mode.`);
});

