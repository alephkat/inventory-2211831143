import { Router } from 'express';
import { transactionService } from './transactions.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';
const CreateTxSchema = z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    type: z.enum(['received', 'issued', 'returned']),
    quantity: z.number().positive(),
    referenceNumber: z.string().optional(),
    reason: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.coerce.date().optional(),
});
const ApproveSchema = z.object({
    rejectionReason: z.string().optional(),
});
export const transactionsRouter = Router();
transactionsRouter.get('/', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        const pg = getPagination(req.query);
        res.json({ success: true, data: await transactionService.list({ ...pg, productId: req.query.productId, warehouseId: req.query.warehouseId, type: req.query.type, status: req.query.status }) });
    }
    catch (e) {
        next(e);
    }
});
transactionsRouter.get('/:id', requirePermission('view_inventory'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await transactionService.get(req.params.id) });
    }
    catch (e) {
        next(e);
    }
});
transactionsRouter.post('/', requirePermission(['receive_stock', 'issue_stock']), validate(CreateTxSchema), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await transactionService.create(req.body, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
transactionsRouter.post('/:id/approve', requirePermission('approve_transactions'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await transactionService.approve(req.params.id, req.user.id) });
    }
    catch (e) {
        next(e);
    }
});
transactionsRouter.post('/:id/reject', requirePermission('approve_transactions'), validate(ApproveSchema), async (req, res, next) => {
    try {
        res.json({ success: true, data: await transactionService.reject(req.params.id, req.user.id, req.body.rejectionReason) });
    }
    catch (e) {
        next(e);
    }
});
