import { Router } from 'express';
import { warehouseService } from './warehouses.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
const WarehouseSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    address: z.string().optional().nullable(),
    contactPerson: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    managerId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().default(true),
    currentCapacity: z.number().optional().nullable(),
    maxCapacity: z.number().optional().nullable(),
});
const UpdateWarehouseSchema = WarehouseSchema.partial();
export const warehousesRouter = Router();
warehousesRouter.use(requirePermission('manage_warehouses'));
warehousesRouter.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.list({ ...getPagination(req.query), search: req.query.search }) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.get('/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.post('/', validate(WarehouseSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await warehouseService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.put('/:id', validate(UpdateWarehouseSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.update(req.params.id, req.body) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.delete('/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.delete(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
