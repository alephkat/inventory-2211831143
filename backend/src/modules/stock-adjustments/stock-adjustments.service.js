import { AdjustmentReasonCode, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { documentNumber } from '../../shared/utils/document-number.js';
import {
 applyStockMovements,
 assertNonNegativeQuantity,
 assertRejectionReason,
 round2,
 runTransition,
 WORKFLOW_RESOURCE,
} from '../../shared/workflow.js';

/**
 * Stock adjustments: manual corrections to a product/warehouse balance.
 *
 * An adjustment is proposed against the quantity recorded at proposal time
 * and only applied on approval. The `oldQuantity` snapshot is what makes the
 * audit trail meaningful, so a reviewer can always see the balance the
 * adjustment was measured against.
 *
 * PENDING -> APPROVED -> COMPLETED
 * \-> REJECTED
 */

const ADJUSTMENT_INCLUDE = {
 product},
 warehouse},
 adjustedBy},
 approvedBy},
} satisfies Prisma.StockAdjustmentInclude;

/**
 * Reason codes that destroy value, as opposed to correcting a bookkeeping
 * slip. These are the ones an auditor should be able to filter on.
 */
export const VALUE_LOSS_REASON_CODES: AdjustmentReasonCode[] = [
 AdjustmentReasonCode.DAMAGED,
 AdjustmentReasonCode.EXPIRED,
 AdjustmentReasonCode.LOST,
 AdjustmentReasonCode.THEFT,
 AdjustmentReasonCode.QUALITY_ISSUE,
];

export class StockAdjustmentService {
 async list(params) {
 const { page, limit, productId, warehouseId, status, reasonCode } = params;
 const where.StockAdjustmentWhereInput = {};
 if (productId) where.productId = productId;
 if (warehouseId) where.warehouseId = warehouseId;
 if (status) where.status = status ;
 if (reasonCode) where.reasonCode = reasonCode ;

 const [items, total] = await Promise.all([
 prisma.stockAdjustment.findMany({
 where,
 skip: (page - 1) * limit,
 take: limit,
 include_INCLUDE,
 orderBy,
 }),
 prisma.stockAdjustment.count({ where }),
 ]);
 return { items, total, page, limit };
 }

 async get(id) {
 const adjustment = await prisma.stockAdjustment.findUnique({
 where,
 include_INCLUDE,
 });
 if (!adjustment) throw ApiError.notFound('Stock adjustment not found');
 return adjustment;
 }

 /**
 * Propose an adjustment to an absolute counted quantity. The current
 * balance is snapshotted as `oldQuantity` so the delta is fixed at
 * proposal time and cannot silently shift.
 */
 async create(
 data,
 userId) {
 assertNonNegativeQuantity(data.newQuantity, 'New quantity');
 if (!data.reason?.trim()) {
 throw ApiError.badRequest('An adjustment requires a reason');
 }

 const product = await prisma.product.findUnique({
 where,
 select,
 });
 if (!product) throw ApiError.badRequest('Invalid product');

 const warehouse = await prisma.warehouse.findUnique({
 where,
 select,
 });
 if (!warehouse) throw ApiError.badRequest('Invalid warehouse');

 // Create the (empty) balance row if this is the first movement for the
 // pair, so an adjustment from zero is expressible.
 const inventory = await prisma.inventory.upsert({
 where},
 update,
 create,
 });

 const oldQuantity = round2(inventory.currentQuantity);
 const newQuantity = round2(data.newQuantity);
 const difference = round2(newQuantity - oldQuantity);

 if (difference === 0) {
 throw ApiError.badRequest(
 `The new quantity matches the current stock of ${oldQuantity} for ${product.name}; there is nothing to adjust`);
 }

 const adjustmentNumber = documentNumber('ADJ');
 const adjustment = await prisma.stockAdjustment.create({
 data,
 });

 await createAuditLog({
 userId,
 action: 'CREATE',
 resourceType_RESOURCE.adjustment,
 resourceId: adjustment.id,
 newValues,
 });

 return this.get(adjustment.id);
 }

 /**
 * Approve and apply in one step. The movement is transactional with the
 * status change, and the ledger row records the balance it was measured
 * against.
 */
 async approve(id, userId) {
 const adjustment = await this.get(id);

 await runTransition({
 workflow: 'adjustment',
 model: 'stockAdjustment',
 entityId: id,
 from: adjustment.status,
 to.APPROVED,
 verb: 'approve',
 actorId: userId,
 reference: adjustment.adjustmentNumber,
 patch,
 });

 await this.post(id, userId);

 return this.get(id);
 }

 /**
 * Apply an approved adjustment to the balance. Split out from `approve` so
 * an approver and a poster can be different people.
 */
 async post(id, userId) {
 const adjustment = await this.get(id);

 await runTransition({
 workflow: 'adjustment',
 model: 'stockAdjustment',
 entityId: id,
 from: adjustment.status,
 to.COMPLETED,
 verb: 'post',
 actorId: userId,
 reference: adjustment.adjustmentNumber,
 details,
 sideEffects: async (tx) => {
 await applyStockMovements(tx, [
 {
 productId: adjustment.productId,
 warehouseId: adjustment.warehouseId,
 quantity.abs(adjustment.difference),
 direction: adjustment.difference > 0 ? 'IN' : 'OUT',
 type: this.ledgerType(adjustment.reasonCode),
 reason: `${adjustment.reasonCode}: ${adjustment.reason}`,
 referenceNumber: adjustment.adjustmentNumber,
 performedById: userId,
 productLabel: adjustment.product?.name,
 },
 ]);
 },
 });

 return this.get(id);
 }

 async reject(id, userId, reason?) {
 const adjustment = await this.get(id);
 const rejectionReason = assertRejectionReason(reason);

 await runTransition({
 workflow: 'adjustment',
 model: 'stockAdjustment',
 entityId: id,
 from: adjustment.status,
 to.REJECTED,
 verb: 'reject',
 actorId: userId,
 reference: adjustment.adjustmentNumber,
 reason: rejectionReason,
 patch,
 });

 return this.get(id);
 }

 async cancel(id, userId, reason?) {
 const adjustment = await this.get(id);

 await runTransition({
 workflow: 'adjustment',
 model: 'stockAdjustment',
 entityId: id,
 from: adjustment.status,
 to.CANCELLED,
 verb: 'cancel',
 actorId: userId,
 reference: adjustment.adjustmentNumber,
 reason: reason ?? null,
 });

 return this.get(id);
 }

 async ledger(id) {
 const adjustment = await this.get(id);
 return prisma.inventoryTransaction.findMany({
 where,
 include},
 warehouse},
 performedBy},
 },
 orderBy,
 });
 }

 /**
 * Why the adjustment reduced stock. Damaged, lost, expired and stolen stock
 * are materially different from a bookkeeping correction, and reports treat
 * them differently, so they get distinct ledger types.
 */
 ledgerType(reasonCode) {
 switch (reasonCode) {
 case AdjustmentReasonCode.DAMAGED:
 return TransactionType.DAMAGED;
 case AdjustmentReasonCode.EXPIRED:
 return TransactionType.EXPIRED;
 case AdjustmentReasonCode.LOST:
 return TransactionType.LOST;
 default:
 return TransactionType.ADJUSTED;
 }
 }
}

export const stockAdjustmentService = new StockAdjustmentService();
