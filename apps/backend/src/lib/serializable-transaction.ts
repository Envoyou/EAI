import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/db';

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      const isWriteConflict =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2034';
      if (!isWriteConflict || attempt === MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }

  throw new Error('Serializable transaction retry limit exceeded');
}
