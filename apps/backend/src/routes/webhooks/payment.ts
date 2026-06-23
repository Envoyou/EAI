import { Router } from 'express';
import { prisma } from '@/lib/db';
import { getPaymentGateway } from '@/lib/payment';
import type { PaymentProvider } from '@/lib/payments/types';
import { processVerifiedPaymentEvent } from '@/lib/payment-processing';

const router = Router();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readWebhookOrderId = (value: unknown) => {
  if (!isRecord(value)) return null;
  if (typeof value.order_id === 'string') return value.order_id;
  const order = value.order;
  if (isRecord(order) && typeof order.invoice_number === 'string') {
    return order.invoice_number;
  }
  return null;
};

router.post('/', async (req: any, res) => {
  try {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const payload = req.body;
    const orderId = readWebhookOrderId(payload);
    
    if (!orderId) {
      return res.status(400).json({ error: 'Missing or invalid payload fields' });
    }

    const paymentOrder = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
    });
    if (!paymentOrder) {
      return res.status(404).json({ error: 'Payment order not found' });
    }
    if (paymentOrder.status === 'paid') {
      return res.json({ message: 'Transaction already processed' });
    }

    const provider = paymentOrder.provider as PaymentProvider;
    const gateway = getPaymentGateway(provider);
    
    // Construct Web Request for parseWebhook
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const notification = await gateway.parseWebhook(
      new Request(fullUrl, {
        method: 'POST',
        headers: req.headers as any,
        body: rawBody,
      })
    );
    
    console.info('[Payment Webhook] Notification received', {
      orderId,
      provider,
      status: notification.status,
      isPaid: notification.isPaid,
    });

    const result = await processVerifiedPaymentEvent(orderId, notification);

    console.info('[Payment Webhook] Notification completed', {
      orderId,
      provider,
      result,
    });

    return res.json({
      success: true,
      message:
        result === 'processed'
          ? 'Payment webhook processed successfully'
          : result === 'already_processed'
            ? 'Transaction already processed'
            : `Webhook received with status ${notification.status}`,
    });
  } catch (error: any) {
    console.error('[Payment Webhook] Processing error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status =
      message.startsWith('Invalid ') ||
      message.includes('missing required fields') ||
      error instanceof SyntaxError
        ? 400
        : 500;
    return res.status(status).json({ error: message });
  }
});

export default router;
