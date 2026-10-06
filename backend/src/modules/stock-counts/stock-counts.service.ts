import { AdjustmentReasonCode, CountStatus, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';
import { documentNumber } from '../../shared/utils/document-number';
import { notificationService } from '../notifications/notifications.service';
import {
  applyStockMovements,
  assertLinesPresent,
  assertNoDuplicateLines,
  assertNonNegativeQuantity,
  assertRejectionReason,
  assertWithinVarianceTolerance,
  computeCountVariance,
  round2,
  runTransition,
  WORKFLOW_RESOURCE,
} from '../../shared/workflow';

/**
 * Cycle counting (stock counts).
 *
 * A count is deliberately a two-phase correction. Counting records what the
 * floor says; it never changes stock. Only an APPROVED count can be
 * ADJUSTED, and that step is the single place where the books are moved to
 * match the count. That separation is what makes a miscount recoverable: a
 * bad count can be reviewed and rejected while the ledgers are still intact.
 *
 *   DRAFT -> IN_PROGRESS -> COMPLETED -> REVIEWED -> APPROVED -> ADJUSTED
 */

const COUNT_INCLUDE = {
  warehouse: { select: { id: true, name: true, code: true } },
  items: {
    include: { product: { select: { id: true, sku: true, name: true, unit: true, costPrice: true } } },
    orderBy: { productId: 'asc' as const },
  },
  countedBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.StockCountInclude;

export interface CountLineInput {
  productId: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  expiryDate?: Date | null;
}

export interface CountedLineInput {
  countItemId: string;
  countedQuantity: number;
  notes?: string | null;
}

export class StockCountService {
  async list(params: {
    page: number;
    limit: number;
    status?: string;
    warehouseId?: string;
  }) {
    const { page, limit, status, warehouseId } = params;
    const where: Prisma.StockCountWhereInput = {};
    if (status) where.status = status as CountStatus;
    if (warehouseId) where.warehouseId = warehouseId;

    const [items, total] = await Promise.all([
      prisma.stockCount.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { warehouse: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockCount.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const count = await prisma.stockCount.findUnique({ where: { id }, include: COUNT_INCLUDE });
    if (!count) throw ApiError.notFound('Stock count not found');
    return count;
  }

  /**
   * Open a count. Seeded lines are optional; a count with no lines snapshots
   * the warehouse's full inventory when it is started, which is the usual
   * full-stocktake case.
   */
  async create(
    data: { warehouseId: string; notes?: string; items?: CountLineInput[] },
    userId: string,
  ) {
    if (data.items) {
      assertLinesPresent(data.items, 'Count line');
      assertNoDuplicateLines(
        data.items,
        (line) => `${line.productId}:${line.batchNumber ?? ''}`,
        'count line',
      );
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: data.warehouseId },
      select: { id: true, isActive: true },
    });
    if (!warehouse) throw ApiError.badRequest('Invalid warehouse');

    const productIds = data.items ? [...new Set(data.items.map((line) => line.productId))] : [];
    if (data.items && productIds.length) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw ApiError.badRequest('One or more count lines reference an unknown product');
      }
    }

    const count = await prisma.stockCount.create({
      data: {
        countNumber: documentNumber('CNT'),
        warehouseId: data.warehouseId,
        status: CountStatus.DRAFT,
        notes: data.notes ?? null,
        items: data.items
          ? {
              create: data.items.map((line) => ({
                productId: line.productId,
                batchNumber: line.batchNumber ?? '',
                location: line.location ?? null,
                notes: line.notes ?? null,
                expiryDate: line.expiryDate ?? null,
                // Seeded lines are un-counted until the floor reports a
                // figure, so variance starts at zero rather than unknown.
                systemQuantity: 0,
                countedQuantity: 0,
                variance: 0,
                varianceValue: 0,
              })),
            }
          : undefined,
      },
    });

    await createAuditLog({
      userId,
      action: 'CREATE',
      resourceType: WORKFLOW_RESOURCE.count,
      resourceId: count.id,
      newValues: { status: CountStatus.DRAFT, countNumber: count.countNumber },
    });

    return this.get(count.id);
  }

  /**
   * Start counting. If the count has no lines yet, snapshot the warehouse's
   * current balances so the count sheet reflects what the books claim.
   */
  async start(id: string, userId: string) {
    const count = await this.get(id);
    if (count.items.length > 0) {
      throw ApiError.conflict(
        'This count already has lines; delete and recreate it to resnapshot the warehouse',
      );
    }

    const balances = await prisma.inventory.findMany({
      where: { warehouseId: count.warehouseId },
      select: { productId: true, currentQuantity: true },
    });
    if (balances.length === 0) {
      throw ApiError.conflict('There is no stock recorded in this warehouse to count');
    }

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.IN_PROGRESS,
      verb: 'start counting',
      actorId: userId,
      reference: count.countNumber,
      patch: { countedById: userId, countedAt: new Date() },
      sideEffects: async (tx) => {
        await tx.stockCountItem.createMany({
          data: balances.map((balance) => ({
            countId: id,
            productId: balance.productId,
            systemQuantity: balance.currentQuantity,
            countedQuantity: 0,
            variance: 0,
            varianceValue: 0,
            batchNumber: '',
            countedById: userId,
            countedAt: new Date(),
          })),
        });
      },
    });

    return this.get(id);
  }

  /** Record what the floor actually found. Does not move stock. */
  async recordLines(id: string, userId: string, input: { items: CountedLineInput[] }) {
    const count = await this.get(id);
    assertLinesPresent(input.items, 'Counted line');
    assertNoDuplicateLines(input.items, (line) => line.countItemId, 'counted line');

    for (const line of input.items) {
      assertNonNegativeQuantity(line.countedQuantity, 'Counted quantity');
    }

    const costs = await this.productCosts(input.items.map((line) => line.countItemId));

    for (const line of input.items) {
      const item = count.items.find((candidate) => candidate.id === line.countItemId);
      if (!item) throw ApiError.badRequest(`Unknown count line: ${line.countItemId}`);
    }

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      // Recording figures on a count that is already past IN_PROGRESS is
      // normal: recounting happens until the counter submits the sheet.
      to: count.status === CountStatus.DRAFT ? CountStatus.IN_PROGRESS : count.status,
      verb: 'record counts',
      actorId: userId,
      reference: count.countNumber,
      notify: false,
      patch: { countedById: userId, countedAt: new Date() },
      sideEffects: async (tx) => {
        for (const line of input.items) {
          const item = count.items.find((candidate) => candidate.id === line.countItemId)!;
          const variance = computeCountVariance(
            item.systemQuantity,
            line.countedQuantity,
            costs.get(item.productId) ?? 0,
          );
          await tx.stockCountItem.update({
            where: { id: line.countItemId },
            data: {
              countedQuantity: line.countedQuantity,
              variance: variance.difference,
              varianceValue: variance.value,
              notes: line.notes ?? null,
              countedById: userId,
              countedAt: new Date(),
            },
          });
        }
      },
    });

    return this.get(id);
  }

  /** Submit the sheet for review. Every line must have a counted figure. */
  async complete(id: string, userId: string) {
    const count = await this.get(id);
    if (count.items.length === 0) {
      throw ApiError.conflict('A count with no lines cannot be completed');
    }
    const uncounted = count.items.filter((item) => item.countedAt === null);
    if (uncounted.length > 0) {
      throw ApiError.conflict(
        `${uncounted.length} line(s) have no counted quantity; record every line before submitting`,
      );
    }

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.COMPLETED,
      verb: 'submit count',
      actorId: userId,
      reference: count.countNumber,
      patch: { countedById: userId, countedAt: new Date() },
    });

    return this.get(id);
  }

  async review(id: string, userId: string) {
    const count = await this.get(id);

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.REVIEWED,
      verb: 'review count',
      actorId: userId,
      reference: count.countNumber,
      patch: { reviewedById: userId, reviewedAt: new Date() },
    });

    return this.get(id);
  }

  /**
   * Approve the count for posting. `tolerancePercent` caps how much
   * unexplained variance may be written off without a closer look; exceeding
   * it is a conflict, not a silent write-off.
   */
  async approve(id: string, userId: string, options: { tolerancePercent?: number } = {}) {
    const count = await this.get(id);
    const tolerance = options.tolerancePercent ?? DEFAULT_VARIANCE_TOLERANCE_PERCENT;

    const variances = count.items.map((item) =>
      computeCountVariance(item.systemQuantity, item.countedQuantity, item.product?.costPrice ?? 0),
    );
    const worst = variances.reduce((max, v) => Math.max(max, v.percent), 0);
    assertWithinVarianceTolerance(worst, tolerance, 'Largest count variance');

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.APPROVED,
      verb: 'approve count',
      actorId: userId,
      reference: count.countNumber,
      details: { worstVariancePercent: worst, tolerancePercent: tolerance },
      patch: { approvedById: userId, approvedAt: new Date() },
    });

    return this.get(id);
  }

  /**
   * Post the count: move every line's balance to the counted figure. This is
   * the only point at which a count changes stock, and it is transactional.
   */
  async post(id: string, userId: string, options: { reasonCode?: AdjustmentReasonCode } = {}) {
    const count = await this.get(id);
    const reasonCode = options.reasonCode ?? AdjustmentReasonCode.CYCLE_COUNT;

    const movements = count.items
      .filter((item) => item.variance !== 0)
      .map((item) => ({
        productId: item.productId,
        warehouseId: count.warehouseId,
        quantity: Math.abs(item.variance),
        direction: (item.variance > 0 ? 'IN' : 'OUT') as 'IN' | 'OUT',
        type: TransactionType.ADJUSTED,
        reason: `Stock count ${count.countNumber} (${reasonCode})`,
        referenceNumber: count.countNumber,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate,
        performedById: userId,
        requireExisting: true,
        productLabel: item.product?.name,
      }));

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.ADJUSTED,
      verb: 'post count',
      actorId: userId,
      reference: count.countNumber,
      details: { adjustedLines: movements.length, reasonCode },
      sideEffects: async (tx) => {
        if (movements.length > 0) {
          await applyStockMovements(tx, movements);
        }
      },
    });

    return this.get(id);
  }

  async reject(id: string, userId: string, reason?: string) {
    const count = await this.get(id);
    const rejectionReason = assertRejectionReason(reason);

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.CANCELLED,
      verb: 'reject count',
      actorId: userId,
      reference: count.countNumber,
      reason: rejectionReason,
      patch: { reviewedById: userId, reviewedAt: new Date(), notes: rejectionReason },
    });

    return this.get(id);
  }

  async cancel(id: string, userId: string, reason?: string) {
    const count = await this.get(id);

    await runTransition<CountStatus>({
      workflow: 'count',
      model: 'stockCount',
      entityId: id,
      from: count.status,
      to: CountStatus.CANCELLED,
      verb: 'cancel count',
      actorId: userId,
      reference: count.countNumber,
      reason: reason ?? null,
    });

    return this.get(id);
  }

  /** Variance summary for review screens; does not require an open count. */
  async varianceReport(warehouseId: string) {
    const items = await prisma.stockCountItem.findMany({
      where: { count: { warehouseId, status: { in: [CountStatus.REVIEWED, CountStatus.APPROVED, CountStatus.ADJUSTED] } } },
      include: { product: { select: { sku: true, name: true, unit: true } }, count: true },
      orderBy: { varianceValue: 'asc' },
    });

    return items.map((item) => ({
      countId: item.countId,
      countNumber: item.count.countNumber,
      productId: item.productId,
      productName: item.product.name,
      systemQuantity: item.systemQuantity,
      countedQuantity: item.countedQuantity,
      variance: item.variance,
      varianceValue: item.varianceValue,
    }));
  }

  /** Alert reviewers when an approved count is about to be posted. */
  async notifyVariance(id: string, userId: string) {
    const count = await this.get(id);
    const total = count.items.reduce((sum, item) => sum + item.varianceValue, 0);
    try {
      await notificationService.dispatch(userId, {
        title: 'Stock Count Variance',
        body: `Count ${count.countNumber} in ${count.warehouse.name} carries a net variance of ${round2(total)}`,
        type: 'COUNT_VARIANCE',
        priority: 'MEDIUM',
        data: { countId: count.id, totalVarianceValue: round2(total) },
      });
    } catch {
      // Advisory only.
    }
    return { totalVarianceValue: round2(total) };
  }

  private async productCosts(itemIds: string[]): Promise<Map<string, number>> {
    const items = await prisma.stockCountItem.findMany({
      where: { id: { in: itemIds } },
      select: { productId: true, product: { select: { costPrice: true } } },
    });
    return new Map(items.map((item) => [item.productId, item.product.costPrice]));
  }
}

/** Variances above this need an explicit override before posting. */
export const DEFAULT_VARIANCE_TOLERANCE_PERCENT = 5;

export const stockCountService = new StockCountService();
