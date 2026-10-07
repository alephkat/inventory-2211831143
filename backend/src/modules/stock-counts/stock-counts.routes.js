import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import { stockCountService } from './stock-counts.service.js';

const ListSchema = z.object({
 page: z.coerce.number().int().positive().optional(),
 limit: z.coerce.number().int().positive().max(100).optional(),
 status: z
 .enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED', 'APPROVED', 'ADJUSTED', 'CANCELLED'])
 .optional(),
 warehouseId: z.string().uuid().optional(),
});

const CountLineSchema = z.object({
 productId: z.string().uuid(),
 batchNumber: z.string().nullish(),
 location: z.string().nullish(),
 notes: z.string().nullish(),
 expiryDate: z.coerce.date().nullish(),
});

const CreateCountSchema = z.object({
 warehouseId: z.string().uuid(),
 notes: z.string().optional(),
 items: z.array(CountLineSchema).optional(),
});

const RecordLinesSchema = z.object({
 items: z
 .array(
 z.object({
 countItemId: z.string().uuid(),
 countedQuantity: z.number().nonnegative(),
 notes: z.string().nullish(),
 }))
 .min(1, 'Record at least one counted line'),
});

const ReasonSchema = z.object({
 reason: z.string().min(1).optional(),
 rejectionReason: z.string().min(1).optional(),
});

const ApproveSchema = z.object({
 tolerancePercent: z.number().min(0).max(100).optional(),
});

const PostSchema = z.object({
 reasonCode: z
 .enum([
 'DAMAGED',
 'EXPIRED',
 'LOST',
 'THEFT',
 'CYCLE_COUNT',
 'RECLASSIFICATION',
 'RETURN',
 'QUALITY_ISSUE',
 'OTHER',
 ])
 .optional(),
});

export const stockCountsRouter = Router();

stockCountsRouter.get(
 '/',
 requirePermission('view_inventory'),
 validate(ListSchema, 'query'),
 asyncHandler(async (req, res) => {
 const query = req.query as unknown as z.infer<typeof ListSchema>;
 const { page, limit } = getPagination(query);
 const result = await stockCountService.list({ page, limit, ...query });
 res.json(sendPaginated(result.items, result.total, result.page, result.limit));
 }));

stockCountsRouter.get(
 '/variance',
 requirePermission('view_inventory'),
 validate(z.object({ warehouseId: z.string().uuid() }), 'query'),
 asyncHandler(async (req, res) => {
 const { warehouseId } = req.query as unknown as { warehouseId };
 res.json(sendSuccess(await stockCountService.varianceReport(warehouseId)));
 }));

stockCountsRouter.get(
 '/:id',
 requirePermission('view_inventory'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.get(req.params.id)));
 }));

stockCountsRouter.post(
 '/',
 requirePermission('count_stock'),
 validate(CreateCountSchema),
 asyncHandler(async (req, res) => {
 res.status(201).json(sendSuccess(await stockCountService.create(req.body, req.user!.id)));
 }));

/** Snapshot the warehouse and begin counting. */
stockCountsRouter.post(
 '/:id/start',
 requirePermission('count_stock'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.start(req.params.id, req.user!.id)));
 }));

stockCountsRouter.post(
 '/:id/items',
 requirePermission('count_stock'),
 validate(RecordLinesSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.recordLines(req.params.id, req.user!.id, req.body)));
 }));

stockCountsRouter.post(
 '/:id/complete',
 requirePermission('count_stock'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.complete(req.params.id, req.user!.id)));
 }));

stockCountsRouter.post(
 '/:id/review',
 requirePermission('approve_stock_counts'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.review(req.params.id, req.user!.id)));
 }));

stockCountsRouter.post(
 '/:id/approve',
 requirePermission('approve_stock_counts'),
 validate(ApproveSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.approve(req.params.id, req.user!.id, req.body)));
 }));

/** Posting is what actually moves the stock balances. */
stockCountsRouter.post(
 '/:id/post',
 requirePermission('approve_stock_counts'),
 validate(PostSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.post(req.params.id, req.user!.id, req.body)));
 }));

stockCountsRouter.post(
 '/:id/reject',
 requirePermission('approve_stock_counts'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const { reason, rejectionReason } = req.body;
 res.json(
 sendSuccess(await stockCountService.reject(req.params.id, req.user!.id, reason ?? rejectionReason)));
 }));

stockCountsRouter.post(
 '/:id/cancel',
 requirePermission('count_stock'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockCountService.cancel(req.params.id, req.user!.id, req.body.reason)));
 }));
