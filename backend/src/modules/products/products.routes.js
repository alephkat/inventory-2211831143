import { Router } from 'express';
import { productService } from './products.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
const ProductSchema = z.object({
    // Optional: when omitted the system generates a unique SKU. SKUs stay
    // searchable and shown in the UI, but operators no longer type them.
    sku: z.string().min(1).optional(),
    barcode: z.string().optional().nullable(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    categoryId: z.string().uuid(),
    brand: z.string().optional().nullable(),
    unit: z.enum(['PIECE', 'KILOGRAM', 'GRAM', 'LITER', 'MILLILITER', 'METER', 'CENTIMETER', 'BOX', 'CARTON', 'PACK', 'DOZEN', 'TON', 'SET', 'BUNDLE']).default('PIECE'),
    costPrice: z.number().nonnegative(),
    sellingPrice: z.number().nonnegative(),
    minStockLevel: z.number().nonnegative().default(0),
    maxStockLevel: z.number().optional().nullable(),
    reorderLevel: z.number().nonnegative().default(0),
    supplierId: z.string().uuid(),
    warehouseId: z.string().uuid().optional().nullable(),
    batchNumber: z.string().optional().nullable(),
    serialNumber: z.string().optional().nullable(),
    manufacturingDate: z.coerce.date().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK']).default('ACTIVE'),
});
const UpdateProductSchema = ProductSchema.partial();
export const productsRouter = Router();
productsRouter.get('/', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({ success: true, data: await productService.list({
                ...pg,
                search: req.query.search,
                categoryId: req.query.categoryId,
                supplierId: req.query.supplierId,
                warehouseId: req.query.warehouseId,
                status: req.query.status,
                lowStock: req.query.lowStock === 'true',
            }) });
    }
    catch (e) {
        next(e);
    }
});
productsRouter.get('/low-stock', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({ success: true, data: await productService.list({ ...pg, lowStock: true }) });
    }
    catch (e) {
        next(e);
    }
});
productsRouter.get('/:id', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await productService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
productsRouter.post('/', requirePermission('add_product'), validate(ProductSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await productService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
productsRouter.put('/:id', requirePermission('edit_product'), validate(UpdateProductSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await productService.update(req.params.id, req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
productsRouter.delete('/:id', requirePermission('delete_product'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await productService.delete(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
