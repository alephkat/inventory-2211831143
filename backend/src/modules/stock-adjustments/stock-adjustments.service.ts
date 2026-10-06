import { AdjustmentReasonCode, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';
import { documentNumber } from '../../shared/utils/document-number';
import {
  applyStockMovements,
  assertNonNegativeQuantity,
  assertRejectionReason,
  round2,
  runTransition,
  WORKFLOW_RESOURCE,
} from '../../shared/workflow';

/**
 * Stock adjustments: manual corrections to a product/warehouse balance.
 *
 * An adjustment is proposed against the quantity recorded at proposal time
 * and only applied on approval. The `oldQuantity` snapshot is what makes the
 * audit trail meaningful, so a reviewer can always see the balance the
 * adjustment was measured against.
 *
 *   PENDING -> APPROVED -> COMPLETED
 *          \-> REJECTED
 */

const ADJUSTMENT_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, unit: true, costPrice: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  adjustedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StockAdjustmentInclude;

/**
 * Reason codes that destroy value, as opposed to correcting a bookkeeping
 * slip. These are the ones an auditor should be able to filter on.
 */
export const VALUE_LOSS_REASON_CODES: readonly AdjustmentReasonCode[] = [
  AdjustmentReasonCode.DAMAGED,
  AdjustmentReasonCode.EXPIRED,
  AdjustmentReasonCode.LOST,
  AdjustmentReasonCode.THEFT,
  AdjustmentReasonCode.QUALITY_ISSUE,
];

export class StockAdjustmentService {
  async list(params: {
    page: number;
    limit: number;
    productId?: string;
    warehouseId?: string;
    status?: string;
    reasonCode?: string;
  }) {
    const { page, limit, productId, warehouseId, status, reasonCode } = params;
    const where: Prisma.StockAdjustmentWhereInput = {};
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status as TransactionStatus;
    if (reasonCode) where.reasonCode = reasonCode as AdjustmentReasonCode;

    const [items, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: ADJUSTMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockAdjustment.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const adjustment = await prisma.stockAdjustment.findUnique({
      where: { id },
      include: ADJUSTMENT_INCLUDE,
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
    data: {
      productId: string;
      warehouseId: string;
      newQuantity: number;
      reason: string;
      reasonCode: AdjustmentReasonCode;
    },
    userId: string,
  ) {
    assertNonNegativeQuantity(data.newQuantity, 'New quantity');
    if (!data.reason?.trim()) {
      throw ApiError.badRequest('An adjustment requires a reason');
    }

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true, name: true },
    });
    if (!product) throw ApiError.badRequest('Invalid product');

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
      select: { id: true, isActive: true },
    });
    if (!warehouse) throw ApiError.badRequest('Invalid warehouse');

    // Create the (empty) balance row if this is the first movement for the
    // pair, so an adjustment from zero is expressible.
    const inventory = await prisma.inventory.upsert({
      where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
      update: {},
      create: { productId: data.productId, warehouseId: data.warehouseId, stockValue: 0 },
    });

    const oldQuantity = round2(inventory.currentQuantity);
    const newQuantity = round2(data.newQuantity);
    const difference = round2(newQuantity - oldQuantity);

    if (difference === 0) {
      throw ApiError.badRequest(
        `The new quantity matches the current stock of ${oldQuantity} for ${product.name}; there is nothing to adjust`,
      );
    }

    const adjustmentNumber = documentNumber('ADJ');
    const adjustment = await prisma.stockAdjustment.create({
      data: {
        adjustmentNumber,
        productId: data.productId,
        warehouseId: data.warehouseId,
        oldQuantity,
        newQuantity,
        difference,
        reason: data.reason.trim(),
        reasonCode: data.reasonCode,
        adjustedById: userId,
        adjustedAt: new Date(),
        status: TransactionStatus.PENDING,
      },
    });

    await createAuditLog({
      userId,
      action: 'CREATE',
      resourceType: WORKFLOW_RESOURCE.adjustment,
      resourceId: adjustment.id,
      newValues: {
        status: TransactionStatus.PENDING,
        adjustmentNumber,
        oldQuantity,
        newQuantity,
        difference,
        reasonCode: data.reasonCode,
      },
    });

    return this.get(adjustment.id);
  }

  /**
   * Approve and apply in one step. The movement is transactional with the
   * status change, and the ledger row records the balance it was measured
   * against.
   */
  async approve(id: string, userId: string) {
    const adjustment = await this.get(id);

    await runTransition<TransactionStatus>({
      workflow: 'adjustment',
      model: 'stockAdjustment',
      entityId: id,
      from: adjustment.status,
      to: TransactionStatus.APPROVED,
      verb: 'approve',
      actorId: userId,
      reference: adjustment.adjustmentNumber,
      patch: { approvedById: userId, approvedAt: new Date() },
    });

    await this.post(id, userId);

    return this.get(id);
  }

  /**
   * Apply an approved adjustment to the balance. Split out from `approve` so
   * an approver and a poster can be different people.
   */
  async post(id: string, userId: string) {
    const adjustment = await this.get(id);

    await runTransition<TransactionStatus>({
      workflow: 'adjustment',
      model: 'stockAdjustment',
      entityId: id,
      from: adjustment.status,
      to: TransactionStatus.COMPLETED,
      verb: 'post',
      actorId: userId,
      reference: adjustment.adjustmentNumber,
      details: { difference: adjustment.difference },
      sideEffects: async (tx) => {
        await applyStockMovements(tx, [
          {
            productId: adjustment.productId,
            warehouseId: adjustment.warehouseId,
            quantity: Math.abs(adjustment.difference),
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

  async reject(id: string, userId: string, reason?: string) {
    const adjustment = await this.get(id);
    const rejectionReason = assertRejectionReason(reason);

    await runTransition<TransactionStatus>({
      workflow: 'adjustment',
      model: 'stockAdjustment',
      entityId: id,
      from: adjustment.status,
      to: TransactionStatus.REJECTED,
      verb: 'reject',
      actorId: userId,
      reference: adjustment.adjustmentNumber,
      reason: rejectionReason,
      patch: { approvedById: userId, approvedAt: new Date(), rejectionReason },
    });

    return this.get(id);
  }

  async cancel(id: string, userId: string, reason?: string) {
    const adjustment = await this.get(id);

    await runTransition<TransactionStatus>({
      workflow: 'adjustment',
      model: 'stockAdjustment',
      entityId: id,
      from: adjustment.status,
      to: TransactionStatus.CANCELLED,
      verb: 'cancel',
      actorId: userId,
      reference: adjustment.adjustmentNumber,
      reason: reason ?? null,
    });

    return this.get(id);
  }

  async ledger(id: string) {
    const adjustment = await this.get(id);
    return prisma.inventoryTransaction.findMany({
      where: { referenceNumber: adjustment.adjustmentNumber },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
        performedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Why the adjustment reduced stock. Damaged, lost, expired and stolen stock
   * are materially different from a bookkeeping correction, and reports treat
   * them differently, so they get distinct ledger types.
   */
  private ledgerType(reasonCode: AdjustmentReasonCode): TransactionType {
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
