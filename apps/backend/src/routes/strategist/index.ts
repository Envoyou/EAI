import { Router } from 'express';
import chatRoutes from './handlers/chat';
import planRoutes from './handlers/plan';
import draftFromNotesRoutes from './handlers/draft-from-notes';
import sessionRoutes from './handlers/sessions';

const router = Router();

router.use(chatRoutes);
router.use(planRoutes);
router.use(draftFromNotesRoutes);
router.use(sessionRoutes);

export default router;
