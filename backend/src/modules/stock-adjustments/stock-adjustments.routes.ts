import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler';
import { requirePermission } from '../../shared/middlewares/auth';
import { validate } from '../../shared/middlewares/validate';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response';
import { stockAdjustmentService } from './stock-adjustments.service';

const ListSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED']).optional(),
  reasonCode: z.string().optional(),
});

const REASON_CODES = [
  'DAMAGED',
  'EXPIRED',
  'LOST',
  'THEFT',
  'CYCLE_COUNT',
  'RECLASSIFICATION',
  'RETURN',
  'QUALITY_ISSUE',
  'OTHER',
] as const;

const CreateAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  newQuantity: z.number().nonnegative(),
  reason: z.string().min(1, 'An adjustment requires a reason'),
  reasonCode: z.enum(REASON_CODES),
});

const ReasonSchema = z.object({
  reason: z.string().min(1).optional(),
  rejectionReason: z.string().min(1).optional(),
});

export const stockAdjustmentsRouter = Router();

stockAdjustmentsRouter.get(
  '/',
  requirePermission('view_inventory'),
  validate(ListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListSchema>;
    const { page, limit } = getPagination(query);
    const result = await stockAdjustmentService.list({ page, limit, ...query });
    res.json(sendPaginated(result.items, result.total, result.page, result.limit));
  }),
);

stockAdjustmentsRouter.get(
  '/:id',
  requirePermission('view_inventory'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockAdjustmentService.get(req.params.id)));
  }),
);

stockAdjustmentsRouter.get(
  '/:id/ledger',
  requirePermission('view_inventory'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockAdjustmentService.ledger(req.params.id)));
  }),
);

stockAdjustmentsRouter.post(
  '/',
  requirePermission('adjust_stock'),
  validate(CreateAdjustmentSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(sendSuccess(await stockAdjustmentService.create(req.body, req.user!.id)));
  }),
);

/** Approves and applies the correction in one step. */
stockAdjustmentsRouter.post(
  '/:id/approve',
  requirePermission('approve_transactions'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockAdjustmentService.approve(req.params.id, req.user!.id)));
  }),
);

/** Applies an already-approved correction, for separated approve/post duties. */
stockAdjustmentsRouter.post(
  '/:id/post',
  requirePermission('adjust_stock'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockAdjustmentService.post(req.params.id, req.user!.id)));
  }),
);

stockAdjustmentsRouter.post(
  '/:id/reject',
  requirePermission('approve_transactions'),
  validate(ReasonSchema),
  asyncHandler(async (req, res) => {
    const { reason, rejectionReason } = req.body;
    res.json(
      sendSuccess(
        await stockAdjustmentService.reject(req.params.id, req.user!.id, reason ?? rejectionReason),
      ),
    );
  }),
);

stockAdjustmentsRouter.post(
  '/:id/cancel',
  requirePermission('adjust_stock'),
  validate(ReasonSchema),
  asyncHandler(async (req, res) => {
    res.json(
      sendSuccess(await stockAdjustmentService.cancel(req.params.id, req.user!.id, req.body.reason)),
    );
  }),
);
