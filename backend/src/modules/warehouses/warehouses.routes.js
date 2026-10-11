import { Router } from 'express';
import { warehouseService } from './warehouses.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
import { zambianPhone } from '../../shared/schemas/phone.js';
const WarehouseSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    address: z.string().optional().nullable(),
    contactPerson: z.string().optional().nullable(),
    phone: zambianPhone,
    managerId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().default(true),
    currentCapacity: z.number().optional().nullable(),
    maxCapacity: z.number().optional().nullable(),
});
const UpdateWarehouseSchema = WarehouseSchema.partial();
export const warehousesRouter = Router();
// Reads only need the view permission; every mutation and workflow
// transition needs the manage permission.
warehousesRouter.get('/', requirePermission(['view_warehouses', 'manage_warehouses']), async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.list({ ...getPagination(req.query), search: req.query.search }) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.get('/:id', requirePermission(['view_warehouses', 'manage_warehouses']), async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.post('/', requirePermission('manage_warehouses'), validate(WarehouseSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await warehouseService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.put('/:id', requirePermission('manage_warehouses'), validate(UpdateWarehouseSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.update(req.params.id, req.body) });
    }
    catch (e) {
        next(e);
    }
});
warehousesRouter.delete('/:id', requirePermission('manage_warehouses'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await warehouseService.delete(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
