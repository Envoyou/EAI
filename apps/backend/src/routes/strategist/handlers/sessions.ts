import { Router, type Request } from 'express';
import { prisma } from '@/lib/db';
import { requireAuth } from '../../../middleware/auth';
import { resolveInternalOrgId } from '../utils/helpers';

const router = Router();

const resolveSessionScope = async (req: Request) => {
  const userId = req.auth!.userId;
  const organizationId = await resolveInternalOrgId(req.auth!.orgId, userId);
  return { userId, organizationId };
};

// GET /api/strategist/sessions
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const scope = await resolveSessionScope(req);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const sessions = await prisma.chatSession.findMany({
      where: scope,
      take: limit,
      skip: offset,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        },
      },
    });

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/strategist/sessions/:id
router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const scope = await resolveSessionScope(req);
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, ...scope },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({ session });
  } catch (error) {
    console.error('Error fetching chat session details:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

// PATCH /api/strategist/sessions/:id
router.patch('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const scope = await resolveSessionScope(req);
    const sessionId = req.params.id;
    const { title, isPinned } = req.body;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, ...scope },
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        title: typeof title === 'string' ? title.trim() : undefined,
        isPinned: typeof isPinned === 'boolean' ? isPinned : undefined,
      },
    });

    res.json({ session: updated });
  } catch (error) {
    console.error('Error updating chat session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /api/strategist/sessions/:id
router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const scope = await resolveSessionScope(req);
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, ...scope },
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
