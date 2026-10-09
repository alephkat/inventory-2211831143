import { Router } from 'express';
import { reportService } from './reports.service.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
export const reportsRouter = Router();
reportsRouter.get('/valuation', requirePermission(['view_reports', 'export_reports']), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({
            success: true,
            data: await reportService.inventoryValuation({
                ...pg,
                categoryId: req.query.categoryId,
                warehouseId: req.query.warehouseId,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
reportsRouter.get('/movements', requirePermission('view_reports'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({
            success: true,
            data: await reportService.stockMovements({
                ...pg,
                type: req.query.type,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                productId: req.query.productId,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
reportsRouter.get('/expiry', requirePermission('view_reports'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({
            success: true,
            data: await reportService.expiryReport({
                ...pg,
                days: req.query.days ? parseInt(req.query.days, 10) : undefined,
                warehouseId: req.query.warehouseId,
                categoryId: req.query.categoryId,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
reportsRouter.get('/fast-moving', requirePermission('view_reports'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await reportService.movingProducts({
                days: req.query.days ? parseInt(req.query.days, 10) : undefined,
                warehouseId: req.query.warehouseId,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
reportsRouter.get('/valuation/export', requirePermission('export_reports'), async (req, res, next) => {
    try {
        const data = await reportService.inventoryValuation({
            page: 1,
            limit: 10000,
            categoryId: req.query.categoryId,
            warehouseId: req.query.warehouseId,
        });
        const csv = reportService.toCsv(data.items);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="inventory-valuation.csv"');
        res.send(csv);
    }
    catch (e) {
        next(e);
    }
});
