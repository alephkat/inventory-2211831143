import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import { stockIssueService } from './stock-issues.service.js';

const ListSchema = z.object({
 page: z.coerce.number().int().positive().optional(),
 limit: z.coerce.number().int().positive().max(100).optional(),
 status: z
 .enum(['PENDING', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED'])
 .optional(),
 warehouseId: z.string().uuid().optional(),
 customerId: z.string().uuid().optional(),
 requesterId: z.string().uuid().optional(),
});

const IssueLineSchema = z.object({
 productId: z.string().uuid(),
 requestedQuantity: z.number().positive(),
 unitPrice: z.number().nonnegative(),
 discountPercent: z.number().min(0).max(100).optional(),
 taxPercent: z.number().min(0).max(100).optional(),
 batchNumber: z.string().nullish(),
 expiryDate: z.coerce.date().nullish(),
 notes: z.string().nullish(),
});

const CreateIssueSchema = z.object({
 warehouseId: z.string().uuid(),
 customerId: z.string().uuid().optional(),
 department: z.string().optional(),
 notes: z.string().optional(),
 items: z.array(IssueLineSchema).min(1, 'An issue needs at least one line item'),
});

const IssueStockSchema = z.object({
 items: z
 .array(
 z.object({
 issueItemId: z.string().uuid(),
 issuedQuantity: z.number().positive(),
 }))
 .optional(),
});

const ReasonSchema = z.object({
 reason: z.string().min(1).optional(),
 rejectionReason: z.string().min(1).optional(),
});

export const stockIssuesRouter = Router();

stockIssuesRouter.get(
 '/',
 requirePermission('view_inventory'),
 validate(ListSchema, 'query'),
 asyncHandler(async (req, res) => {
 const query = req.query as unknown as z.infer<typeof ListSchema>;
 const { page, limit } = getPagination(query);
 const result = await stockIssueService.list({ page, limit, ...query });
 res.json(sendPaginated(result.items, result.total, result.page, result.limit));
 }));

stockIssuesRouter.get(
 '/:id',
 requirePermission('view_inventory'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockIssueService.get(req.params.id)));
 }));

stockIssuesRouter.get(
 '/:id/ledger',
 requirePermission('view_inventory'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockIssueService.ledger(req.params.id)));
 }));

stockIssuesRouter.post(
 '/',
 requirePermission('issue_stock'),
 validate(CreateIssueSchema),
 asyncHandler(async (req, res) => {
 res.status(201).json(sendSuccess(await stockIssueService.create(req.body, req.user!.id)));
 }));

stockIssuesRouter.post(
 '/:id/approve',
 requirePermission('approve_stock_issues'),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockIssueService.approve(req.params.id, req.user!.id)));
 }));

/** Removes stock from the warehouse. */
stockIssuesRouter.post(
 '/:id/issue',
 requirePermission('issue_stock'),
 validate(IssueStockSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockIssueService.issue(req.params.id, req.user!.id, req.body)));
 }));

/** Issues beyond the requested quantity; requires `override_stock_issue`. */
stockIssuesRouter.post(
 '/:id/override',
 requirePermission('override_stock_issue'),
 validate(z.object({ reason: z.string().min(1, 'An override reason is required') })),
 asyncHandler(async (req, res) => {
 res.json(
 sendSuccess(await stockIssueService.override(req.params.id, req.user!.id, req.body.reason)));
 }));

stockIssuesRouter.post(
 '/:id/reject',
 requirePermission('approve_stock_issues'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 const { reason, rejectionReason } = req.body;
 res.json(
 sendSuccess(await stockIssueService.reject(req.params.id, req.user!.id, reason ?? rejectionReason)));
 }));

stockIssuesRouter.post(
 '/:id/cancel',
 requirePermission('issue_stock'),
 validate(ReasonSchema),
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await stockIssueService.cancel(req.params.id, req.user!.id, req.body.reason)));
 }));
