import { Router } from 'express';
import organizationRoutes from './handlers/organizations';
import userRoutes from './handlers/users';
import editorialProfileRoutes from './handlers/editorial-profiles';
import auditLogRoutes from './handlers/audit-logs';

const router = Router();

router.use(organizationRoutes);
router.use(userRoutes);
router.use(editorialProfileRoutes);
router.use(auditLogRoutes);

export default router;
