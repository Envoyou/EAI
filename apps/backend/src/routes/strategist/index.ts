import { Router } from 'express';
import chatRoutes from './handlers/chat';
import planRoutes from './handlers/plan';
import draftFromNotesRoutes from './handlers/draft-from-notes';
import sessionRoutes from './handlers/sessions';
import { mockChatRouter } from './mock-chat';

const router = Router();

if (
  process.env.ENABLE_MOCK_CHAT === 'true' &&
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    '[SECURITY] ENABLE_MOCK_CHAT must NOT be enabled in production.'
  );
}

const mockChatEnabled =
  process.env.ENABLE_MOCK_CHAT === 'true' &&
  process.env.NODE_ENV !== 'production';

if (mockChatEnabled) {
  router.use('/mock-chat', mockChatRouter);
}

router.use(chatRoutes);
router.use(planRoutes);
router.use(draftFromNotesRoutes);
router.use(sessionRoutes);

export default router;
