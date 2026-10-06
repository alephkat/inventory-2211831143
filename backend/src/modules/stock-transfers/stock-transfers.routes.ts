import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler';
import { requirePermission } from '../../shared/middlewares/auth';
import { validate } from '../../shared/middlewares/validate';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response';
import { stockTransferService } from './stock-transfers.service';

const ListSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z
    .enum([
      'REQUESTED',
      'APPROVED',
      'DISPATCHED',
      'IN_TRANSIT',
      'RECEIVED',
      'CONFIRMED',
      'REJECTED',
      'CANCELLED',
    ])
    .optional(),
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
});

const TransferLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  batchNumber: z.string().nullish(),
  expiryDate: z.coerce.date().nullish(),
});

const CreateTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(TransferLineSchema).min(1, 'A transfer needs at least one line'),
});

const ReceiveSchema = z.object({
  items: z
    .array(
      z.object({
        transferItemId: z.string().uuid(),
        receivedQuantity: z.number().positive(),
      }),
    )
    .optional(),
});

const ReasonSchema = z.object({
  reason: z.string().min(1).optional(),
  rejectionReason: z.string().min(1).optional(),
});

export const stockTransfersRouter = Router();

stockTransfersRouter.get(
  '/',
  requirePermission('view_inventory'),
  validate(ListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof ListSchema>;
    const { page, limit, skip } = getPagination(query);
    const result = await stockTransferService.list({ page, limit, ...query });
    res.json(sendPaginated(result.items, result.total, result.page, result.limit, { skip }));
  }),
);

stockTransfersRouter.get(
  '/:id',
  requirePermission('view_inventory'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.get(req.params.id)));
  }),
);

/** Ledger rows for this transfer, for reconciliation. */
stockTransfersRouter.get(
  '/:id/ledger',
  requirePermission('view_inventory'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.ledger(req.params.id)));
  }),
);

stockTransfersRouter.post(
  '/',
  requirePermission('transfer_stock'),
  validate(CreateTransferSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(sendSuccess(await stockTransferService.create(req.body, req.user!.id)));
  }),
);

stockTransfersRouter.post(
  '/:id/approve',
  requirePermission('approve_transactions'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.approve(req.params.id, req.user!.id)));
  }),
);

/** Dispatch is what actually removes stock from the source warehouse. */
stockTransfersRouter.post(
  '/:id/dispatch',
  requirePermission('transfer_stock'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.dispatch(req.params.id, req.user!.id)));
  }),
);

stockTransfersRouter.post(
  '/:id/in-transit',
  requirePermission('transfer_stock'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.markInTransit(req.params.id, req.user!.id)));
  }),
);

stockTransfersRouter.post(
  '/:id/receive',
  requirePermission('transfer_stock'),
  validate(ReceiveSchema),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.receive(req.params.id, req.user!.id, req.body)));
  }),
);

/** Confirmation books the goods in at the destination. */
stockTransfersRouter.post(
  '/:id/confirm',
  requirePermission('transfer_stock'),
  asyncHandler(async (req, res) => {
    res.json(sendSuccess(await stockTransferService.confirm(req.params.id, req.user!.id)));
  }),
);

stockTransfersRouter.post(
  '/:id/reject',
  requirePermission('approve_transactions'),
  validate(ReasonSchema),
  asyncHandler(async (req, res) => {
    const { reason, rejectionReason } = req.body;
    res.json(
      sendSuccess(await stockTransferService.reject(req.params.id, req.user!.id, reason ?? rejectionReason)),
    );
  }),
);

stockTransfersRouter.post(
  '/:id/cancel',
  requirePermission('transfer_stock'),
  validate(ReasonSchema),
  asyncHandler(async (req, res) => {
    res.json(
      sendSuccess(await stockTransferService.cancel(req.params.id, req.user!.id, req.body.reason)),
    );
  }),
);
