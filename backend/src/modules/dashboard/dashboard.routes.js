import { Router } from 'express';
import { dashboardService } from './dashboard.service.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
export const dashboardRouter = Router();
dashboardRouter.get('/stats', requirePermission('view_reports'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await dashboardService.stats(req.query.warehouseId) });
    }
    catch (e) {
        next(e);
    }
});
dashboardRouter.get('/charts/stock-movement', requirePermission('view_reports'), async (req, res, next) => {
    try {
        const days = parseInt(req.query.days ?? '7', 10);
        res.json({ success: true, data: await dashboardService.stockMovementChart(days, req.query.warehouseId) });
    }
    catch (e) {
        next(e);
    }
});
dashboardRouter.get('/charts/inventory-value', requirePermission('view_reports'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await dashboardService.inventoryValueChart(req.query.warehouseId) });
    }
    catch (e) {
        next(e);
    }
});
