import { Router } from 'express';
import { auditLogService } from './audit-logs.service';
import { requirePermission } from '../../shared/middlewares/auth';
import { getPagination } from '../../shared/utils/response';

export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/',
  requirePermission('view_audit_logs'),
  async (req, res, next) => {
    try {
      const pg = getPagination(req.query);
      res.json({
        success: true,
        data: await auditLogService.list({
          ...pg,
          userId: req.query.userId as string | undefined,
          resourceType: req.query.resourceType as string | undefined,
          action: req.query.action as string | undefined,
          startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
          endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);
