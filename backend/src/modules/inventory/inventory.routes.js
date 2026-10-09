import { Router } from 'express';
import { stockLevelService } from './inventory.service.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
export const inventoryRouter = Router();
inventoryRouter.get('/levels', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({ success: true, data: await stockLevelService.list({ ...pg, productId: req.query.productId, warehouseId: req.query.warehouseId, search: req.query.search }) });
    }
    catch (e) {
        next(e);
    }
});
inventoryRouter.get('/levels/low-stock', requirePermission('view_inventory'), async (_req, res, next) => {
    try {
        res.json({ success: true, data: await stockLevelService.lowStock() });
    }
    catch (e) {
        next(e);
    }
});
inventoryRouter.get('/levels/:productId/:warehouseId', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await stockLevelService.get(req.params.productId, req.params.warehouseId) });
    }
    catch (e) {
        next(e);
    }
});
