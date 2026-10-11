import { Router } from 'express';
import { purchaseOrderService } from './purchase-orders.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
const POLineSchema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discountPercent: z.number().min(0).max(100).optional(),
    taxPercent: z.number().min(0).max(100).optional(),
});
const CreatePOSchema = z.object({
    supplierId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    expectedDate: z.coerce.date().optional(),
    currency: z.string().optional(),
    notes: z.string().optional(),
    terms: z.string().optional(),
    items: z.array(POLineSchema).min(1),
});
const AddItemSchema = POLineSchema;
const ReceiveLineSchema = z.object({
    purchaseOrderItemId: z.string().uuid(),
    receivedQuantity: z.number().positive(),
    batchNumber: z.string().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    manufacturingDate: z.coerce.date().optional().nullable(),
});
const ReceiveSchema = z.object({
    items: z.array(ReceiveLineSchema).min(1),
});
const RejectSchema = z.object({
    rejectionReason: z.string().optional(),
});
const CancelSchema = z.object({
    reason: z.string().optional(),
});
export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.get('/', requirePermission(['manage_purchase_orders', 'view_inventory']), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({
            success: true,
            data: await purchaseOrderService.list({
                ...pg,
                status: req.query.status,
                supplierId: req.query.supplierId,
                warehouseId: req.query.warehouseId,
            }),
        });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.get('/:id', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/', requirePermission('manage_purchase_orders'), validate(CreatePOSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await purchaseOrderService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/items/:id', requirePermission('manage_purchase_orders'), validate(AddItemSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.addItem(req.params.id, req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.delete('/items/:id/:itemId', requirePermission('manage_purchase_orders'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.removeItem(req.params.id, req.params.itemId, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/:id/submit', requirePermission('approve_transactions'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.submit(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/:id/approve', requirePermission('approve_transactions'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.approve(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/:id/reject', requirePermission('approve_transactions'), validate(RejectSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.reject(req.params.id, req.user.id, req.body.rejectionReason) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/:id/receive', requirePermission('receive_stock'), validate(ReceiveSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.receive(req.params.id, req.user.id, req.body) });
    }
    catch (e) {
        next(e);
    }
});
purchaseOrdersRouter.post('/:id/cancel', requirePermission('manage_purchase_orders'), validate(CancelSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await purchaseOrderService.cancel(req.params.id, req.user.id, req.body.reason) });
    }
    catch (e) {
        next(e);
    }
});
