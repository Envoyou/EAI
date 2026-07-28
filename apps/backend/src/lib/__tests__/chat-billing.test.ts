import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  checkCreditsRemaining,
  deductCredits,
  InsufficientCreditsError,
} from '../chat-billing';
import { prisma } from '../db';
import { CreditBucket } from '@prisma/client';

vi.mock('../db', () => ({
  prisma: {
    subscription: {
      findFirst: vi.fn(),
    },
    creditTransaction: {
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
    },
    creditUsage: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

type GroupByResult = Awaited<ReturnType<typeof prisma.creditTransaction.groupBy>>;
type SubscriptionResult = Awaited<ReturnType<typeof prisma.subscription.findFirst>>;

describe('chat-billing service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkCreditsRemaining', () => {
    test('should calculate total remaining credits across trial and addon buckets', async () => {
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.creditTransaction.groupBy).mockResolvedValue([
        { bucket: CreditBucket.trial, _sum: { amount: 10 }, _count: null, _avg: null, _min: null, _max: null },
        { bucket: CreditBucket.addon, _sum: { amount: 5 }, _count: null, _avg: null, _min: null, _max: null },
      ] as unknown as GroupByResult);

      const remaining = await checkCreditsRemaining('user_123', null);
      expect(remaining).toBe(15);
    });

    test('should return 0 if trial and addon balances are non-positive and no active subscription', async () => {
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.creditTransaction.groupBy).mockResolvedValue([
        { bucket: CreditBucket.trial, _sum: { amount: -2 }, _count: null, _avg: null, _min: null, _max: null },
        { bucket: CreditBucket.addon, _sum: { amount: 0 }, _count: null, _avg: null, _min: null, _max: null },
      ] as unknown as GroupByResult);

      const remaining = await checkCreditsRemaining('user_123', null);
      expect(remaining).toBe(0);
    });

    test('should include subscription bucket when an active subscription exists', async () => {
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        id: 'sub_1',
        userId: 'user_123',
        organizationId: null,
        plan: 'pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelReason: null,
        cancelFeedback: null,
        lastCreditAllocation: null,
      } as unknown as SubscriptionResult);

      vi.mocked(prisma.creditTransaction.groupBy).mockResolvedValue([
        { bucket: CreditBucket.trial, _sum: { amount: 2 }, _count: null, _avg: null, _min: null, _max: null },
        { bucket: CreditBucket.subscription, _sum: { amount: 50 }, _count: null, _avg: null, _min: null, _max: null },
      ] as unknown as GroupByResult);

      const remaining = await checkCreditsRemaining('user_123', null);
      expect(remaining).toBe(52);
    });
  });

  describe('deductCredits', () => {
    test('should do nothing if amount <= 0', async () => {
      await deductCredits('user_123', null, 0, 'copilot_chat', 'Test');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('should prioritize trial bucket when trial balance is sufficient', async () => {
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.creditTransaction.groupBy).mockResolvedValue([
        { bucket: CreditBucket.trial, _sum: { amount: 10 }, _count: null, _avg: null, _min: null, _max: null },
      ] as unknown as GroupByResult);

      await deductCredits('user_123', null, 2, 'copilot_chat', 'Deduct test');

      expect(prisma.creditTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_123',
          bucket: CreditBucket.trial,
          amount: -2,
        }),
      });
      expect(prisma.creditUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_123',
          creditsConsumed: 2,
        }),
      });
    });

    test('does not deduct credits twice for the same idempotency key', async () => {
      vi.mocked(prisma.creditTransaction.findUnique).mockResolvedValue({
        id: 'existing_transaction',
      } as never);

      await deductCredits(
        'user_123',
        null,
        1,
        'copilot_chat',
        'Retry',
        undefined,
        'strategist-chat:request-1'
      );

      expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
      expect(prisma.creditUsage.create).not.toHaveBeenCalled();
    });

    test('should reject instead of creating a negative balance', async () => {
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.creditTransaction.groupBy).mockResolvedValue(
        [] as unknown as GroupByResult
      );

      await expect(
        deductCredits('user_123', null, 1, 'copilot_chat', 'Deduct test')
      ).rejects.toBeInstanceOf(InsufficientCreditsError);
      expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
      expect(prisma.creditUsage.create).not.toHaveBeenCalled();
    });
  });
});
