import { Router, Request } from 'express';
import { z } from 'zod';
import { createZohoDeskTicket, isZohoDeskEnabled } from '@/lib/zoho-desk';

const router = Router();

const SupportRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  category: z.enum([
    'Billing and credits',
    'Account access',
    'Editorial workflow',
    'CMS integration',
    'Privacy request',
    'Other',
  ]),
  subject: z.string().trim().min(5).max(150),
  message: z.string().trim().min(20).max(5000),
  orderReference: z.string().trim().max(120).optional().default(''),
  website: z.string().max(0).optional().default(''),
});

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const attempts = new Map<string, number[]>();

const getClientIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  'unknown';

const isRateLimited = (key: string) => {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);
  return false;
};

// POST /api/support
router.post('/', async (req, res) => {
  try {
    if (!isZohoDeskEnabled()) {
      return res.status(503).json({ error: 'Support ticket submission is temporarily unavailable.' });
    }

    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > 20_000) {
      return res.status(413).json({ error: 'Support request is too large.' });
    }

    const parsed = SupportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please review the support request fields.' });
    }
    if (parsed.data.website) {
      return res.json({ success: true });
    }

    const rateLimitKey = `${getClientIp(req)}:${parsed.data.email.toLowerCase()}`;
    if (isRateLimited(rateLimitKey)) {
      return res.status(429).json({ error: 'Too many support requests. Please wait before trying again.' });
    }

    const description = [
      parsed.data.message,
      '',
      `Submitted by: ${parsed.data.name} <${parsed.data.email}>`,
      parsed.data.orderReference
        ? `Order or invoice reference: ${parsed.data.orderReference}`
        : '',
      'Submitted through: EAI Support Form',
    ].filter(Boolean).join('\n');
    const ticket = await createZohoDeskTicket({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      description,
      category: parsed.data.category,
    });

    return res.status(201).json({
      success: true,
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error) {
    console.error('[SUPPORT_POST]', error);
    return res.status(502).json({
      error: 'We could not create the support ticket. Please email support@envoyou.com.',
    });
  }
});

export default router;
