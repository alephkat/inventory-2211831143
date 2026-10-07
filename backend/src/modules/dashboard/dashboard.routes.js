import { Router } from 'express';
import { dashboardService } from './dashboard.service.js';
import { requirePermission } from '../../shared/middlewares/auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', requirePermission('view_reports'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await dashboardService.stats(req.query.warehouseId as string | undefined) });
 } catch (e) {
 next(e);
 }
});

dashboardRouter.get('/charts/stock-movement', requirePermission('view_reports'), async (req, res, next) => {
 try {
 const days = parseInt((req.query.days as string) ?? '7', 10);
 res.json({ success: true, data: await dashboardService.stockMovementChart(days, req.query.warehouseId as string | undefined) });
 } catch (e) {
 next(e);
 }
});

dashboardRouter.get('/charts/inventory-value', requirePermission('view_reports'), async (req, res, next) => {
 try {
 res.json({ success: true, data: await dashboardService.inventoryValueChart(req.query.warehouseId as string | undefined) });
 } catch (e) {
 next(e);
 }
});
