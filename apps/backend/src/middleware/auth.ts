import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';

// Extend Express Request type to include auth
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        orgId: string | null;
        orgSlug: string | null;
        orgRole: string | null;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    // Set auth context on request
    req.auth = {
      userId: payload.sub,
      orgId: (payload.org_id as string) || null,
      orgSlug: (payload.org_slug as string) || null,
      orgRole: (payload.org_role as string) || null,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
