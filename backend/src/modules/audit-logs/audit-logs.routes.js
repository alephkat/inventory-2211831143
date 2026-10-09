import { Router } from 'express';
import { auditLogService } from './audit-logs.service.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
export const auditLogsRouter = Router();
auditLogsRouter.get('/', requirePermission('view_audit_logs'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({
            success: true,
            data: await auditLogService.list({
                ...pg,
                userId: req.query.userId,
                resourceType: req.query.resourceType,
                action: req.query.action,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
