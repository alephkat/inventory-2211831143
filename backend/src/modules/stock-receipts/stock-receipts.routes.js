import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import { stockReceiptService } from './stock-receipts.service.js';

const ListSchema = z.object({
 page: z.coerce.number().int().positive().optional(),
 limit: z.coerce.number().int().positive().max(100).optional(),
 status: z
 .enum(['PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED'])
 .optional(),
 warehouseId: z.string().uuid().optional(),
 supplierId: z.string().uuid().optional(),
 purchaseOrderId: z.string().uuid().optional(),
});

const ReceiptLineSchema = z.object({
 productId: z.string().uuid(),
 purchaseOrderItemId: z.string().uuid().nullish(),
 receivedQuantity: z.number().positive(),
 unitPrice: z.number().nonnegative(),
 discountPercent: z.number().min(0).max(100).optional(),
 taxPercent: z.number().min(0).max(100).optional(),
 batchNumber: z.string().nullish(),
 expiryDate: z.coerce.date().nullish(),
 manufacturingDate: z.coerce.date().nullish(),
 serialNumbers: z.string().nullish(),
});

const CreateReceiptSchema = z.object({
 supplierId: z.string().uuid(),
 warehouseId: z.string().uuid(),
 notes: z.string().optional(),
 items: z.array(ReceiptLineSchema).min(1, 'A receipt needs at least one line item'),
});

const ReceiveAgainstPOSchema = z.object({
 warehouseId: z.string().uuid(),
 notes: z.string().optional(),
 items: z
 .array(
 z.object({
 purchaseOrderItemId: z.string().uuid(),
 receivedQuantity: z.number().positive(),
 batchNumber: z.string().nullish(),
 expiryDate: z.coerce.date().nullish(),
 manufacturingDate: z.coerce.date().nullish(),
 serialNumbers: z.string().nullish(),
 }))
 .min(1, 'A receipt needs at least one line item'),
});

const ReasonSchema = z.object({
 reason: z.string().min(1).optional(),
 rejectionReason: z.string().min(1).optional(),
});

export const stockReceiptsRouter = Router();

stockReceiptsRouter.get(
 '/',
 requirePermission('view_inventory'),
 validate(ListSchema, 'query'),
 asyncHandler(async (req, res) => {
 const query = req.query as unknown as z.infer<typeof ListSchema>;
 const { page, limit } = getPagination(query);
 const result = await stockReceiptService.list({ page, limit, ...query });
 res.json(sendPaginated(result.items, result.total, result.page, result.limit));
 }));

stockReceiptsRouter.get(
 '/:id',
 requirePermission('view_inventory'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockReceiptService.get(req.params.id)));
 }));

stockReceiptsRouter.get(
 '/:id/ledger',
 requirePermission('view_inventory'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockReceiptService.ledger(req.params.id)));
 }));

stockReceiptsRouter.post(
 '/',
 requirePermission('manage_stock_receipts'),
 validate(CreateReceiptSchema),
 asyncHandler(async (req, res) => {
 res.status(201).json(sendSuccess(await stockReceiptService.create(req.body, req.user!.id)));
 }));

stockReceiptsRouter.post(
 '/:id/approve',
 requirePermission('approve_stock_receipts'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockReceiptService.approve(req.params.id, req.user!.id)));
 }));

/** Books the goods into stock. */
stockReceiptsRouter.post(
 '/:id/receive',
 requirePermission('receive_stock'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockReceiptService.receive(req.params.id, req.user!.id, req.body)));
 }));

stockReceiptsRouter.post(
 '/purchase-orders/:purchaseOrderId/receive',
 requirePermission('receive_stock'),
 validate(ReceiveAgainstPOSchema),
 asyncHandler(async (req, res) => {
 res.status(201).json(
 sendSuccess(
 await stockReceiptService.receiveAgainstPurchaseOrder(
 req.params.purchaseOrderId,
 req.user!.id,
 req.body)));
 }));

stockReceiptsRouter.post(
 '/:id/reject',
 requirePermission('approve_stock_receipts'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const { reason, rejectionReason } = req.body;
 res.json(
 sendSuccess(await stockReceiptService.reject(req.params.id, req.user!.id, reason ?? rejectionReason)));
 }));

stockReceiptsRouter.post(
 '/:id/cancel',
 requirePermission('manage_stock_receipts'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockReceiptService.cancel(req.params.id, req.user!.id, req.body.reason)));
 }));
