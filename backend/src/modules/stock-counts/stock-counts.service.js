import { AdjustmentReasonCode, CountStatus, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { documentNumber } from '../../shared/utils/document-number.js';
import { notificationService } from '../notifications/notifications.service.js';
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
} from '../../shared/workflow.js';

/**
 * Cycle counting (stock counts).
 *
 * A count is deliberately a two-phase correction. Counting records what the
 * floor says; it never changes stock. Only an APPROVED count can be
 * ADJUSTED, and that step is the single place where the books are moved to
 * match the count. That separation is what makes a miscount recoverable: a
 * bad count can be reviewed and rejected while the ledgers are still intact.
 *
 * DRAFT -> IN_PROGRESS -> COMPLETED -> REVIEWED -> APPROVED -> ADJUSTED
 */

const COUNT_INCLUDE = {
 warehouse},
 items} },
 orderBy,
 },
 countedBy},
 reviewedBy},
 approvedBy},
} satisfies Prisma.StockCountInclude;

export class StockCountService {
 async list(params) {
 const { page, limit, status, warehouseId } = params;
 const where.StockCountWhereInput = {};
 if (status) where.status = status ;
 if (warehouseId) where.warehouseId = warehouseId;

 const [items, total] = await Promise.all([
 prisma.stockCount.findMany({
 where,
 skip: (page - 1) * limit,
 take: limit,
 include} },
 orderBy,
 }),
 prisma.stockCount.count({ where }),
 ]);
 return { items, total, page, limit };
 }

 async get(id) {
 const count = await prisma.stockCount.findUnique({ where, include_INCLUDE });
 if (!count) throw ApiError.notFound('Stock count not found');
 return count;
 }

 /**
 * Open a count. Seeded lines are optional; a count with no lines snapshots
 * the warehouse's full inventory when it is started, which is the usual
 * full-stocktake case.
 */
 async create(
 data,
 userId) {
 if (data.items) {
 assertLinesPresent(data.items, 'Count line');
 assertNoDuplicateLines(
 data.items,
 (line) => `${line.productId}:${line.batchNumber ?? ''}`,
 'count line');
 }

 const warehouse = await prisma.warehouse.findUnique({
 where,
 select,
 });
 if (!warehouse) throw ApiError.badRequest('Invalid warehouse');

 const productIds = data.items ? [...new Set(data.items.map((line) => line.productId))] : [];
 if (data.items && productIds.length) {
 const products = await prisma.product.findMany({
 where},
 select,
 });
 if (products.length !== productIds.length) {
 throw ApiError.badRequest('One or more count lines reference an unknown product');
 }
 }

 const count = await prisma.stockCount.create({
 data)),
 }
 : undefined,
 },
 });

 await createAuditLog({
 userId,
 action: 'CREATE',
 resourceType_RESOURCE.count,
 resourceId: count.id,
 newValues,
 });

 return this.get(count.id);
 }

 /**
 * Start counting. If the count has no lines yet, snapshot the warehouse's
 * current balances so the count sheet reflects what the books claim.
 */
 async start(id, userId) {
 const count = await this.get(id);
 if (count.items.length > 0) {
 throw ApiError.conflict(
 'This count already has lines; delete and recreate it to resnapshot the warehouse');
 }

 const balances = await prisma.inventory.findMany({
 where,
 select,
 });
 if (balances.length === 0) {
 throw ApiError.conflict('There is no stock recorded in this warehouse to count');
 }

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.IN_PROGRESS,
 verb: 'start counting',
 actorId: userId,
 reference: count.countNumber,
 patch,
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
 async recordLines(id, userId, input) {
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

 await runTransition({
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
 patch,
 sideEffects: async (tx) => {
 for (const line of input.items) {
 const item = count.items.find((candidate) => candidate.id === line.countItemId)!;
 const variance = computeCountVariance(
 item.systemQuantity,
 line.countedQuantity,
 costs.get(item.productId) ?? 0);
 await tx.stockCountItem.update({
 where,
 data,
 });
 }
 },
 });

 return this.get(id);
 }

 /** Submit the sheet for review. Every line must have a counted figure. */
 async complete(id, userId) {
 const count = await this.get(id);
 if (count.items.length === 0) {
 throw ApiError.conflict('A count with no lines cannot be completed');
 }
 const uncounted = count.items.filter((item) => item.countedAt === null);
 if (uncounted.length > 0) {
 throw ApiError.conflict(
 `${uncounted.length} line(s) have no counted quantity; record every line before submitting`);
 }

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.COMPLETED,
 verb: 'submit count',
 actorId: userId,
 reference: count.countNumber,
 patch,
 });

 return this.get(id);
 }

 async review(id, userId) {
 const count = await this.get(id);

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.REVIEWED,
 verb: 'review count',
 actorId: userId,
 reference: count.countNumber,
 patch,
 });

 return this.get(id);
 }

 /**
 * Approve the count for posting. `tolerancePercent` caps how much
 * unexplained variance may be written off without a closer look; exceeding
 * it is a conflict, not a silent write-off.
 */
 async approve(id, userId, options= {}) {
 const count = await this.get(id);
 const tolerance = options.tolerancePercent ?? DEFAULT_VARIANCE_TOLERANCE_PERCENT;

 const variances = count.items.map((item) =>
 computeCountVariance(item.systemQuantity, item.countedQuantity, item.product?.costPrice ?? 0));
 const worst = variances.reduce((max, v) => Math.max(max, v.percent), 0);
 assertWithinVarianceTolerance(worst, tolerance, 'Largest count variance');

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.APPROVED,
 verb: 'approve count',
 actorId: userId,
 reference: count.countNumber,
 details,
 patch,
 });

 return this.get(id);
 }

 /**
 * Post the count: move every line's balance to the counted figure. This is
 * the only point at which a count changes stock, and it is transactional.
 */
 async post(id, userId, options= {}) {
 const count = await this.get(id);
 const reasonCode = options.reasonCode ?? AdjustmentReasonCode.CYCLE_COUNT;

 const movements = count.items
 .filter((item) => item.variance !== 0)
 .map((item) => ({
 productId: item.productId,
 warehouseId: count.warehouseId,
 quantity.abs(item.variance),
 direction: (item.variance > 0 ? 'IN' : 'OUT') as 'IN' | 'OUT',
 type.ADJUSTED,
 reason: `Stock count ${count.countNumber} (${reasonCode})`,
 referenceNumber: count.countNumber,
 batchNumber: item.batchNumber || null,
 expiryDate: item.expiryDate,
 performedById: userId,
 requireExisting: true,
 productLabel: item.product?.name,
 }));

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.ADJUSTED,
 verb: 'post count',
 actorId: userId,
 reference: count.countNumber,
 details,
 sideEffects: async (tx) => {
 if (movements.length > 0) {
 await applyStockMovements(tx, movements);
 }
 },
 });

 return this.get(id);
 }

 async reject(id, userId, reason?) {
 const count = await this.get(id);
 const rejectionReason = assertRejectionReason(reason);

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.CANCELLED,
 verb: 'reject count',
 actorId: userId,
 reference: count.countNumber,
 reason: rejectionReason,
 patch,
 });

 return this.get(id);
 }

 async cancel(id, userId, reason?) {
 const count = await this.get(id);

 await runTransition({
 workflow: 'count',
 model: 'stockCount',
 entityId: id,
 from: count.status,
 to.CANCELLED,
 verb: 'cancel count',
 actorId: userId,
 reference: count.countNumber,
 reason: reason ?? null,
 });

 return this.get(id);
 }

 /** Variance summary for review screens; does not require an open count. */
 async varianceReport(warehouseId) {
 const items = await prisma.stockCountItem.findMany({
 where} },
 include}, count: true },
 orderBy,
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
 async notifyVariance(id, userId) {
 const count = await this.get(id);
 const total = count.items.reduce((sum, item) => sum + item.varianceValue, 0);
 try {
 await notificationService.dispatch(userId, {
 title: 'Stock Count Variance',
 body: `Count ${count.countNumber} in ${count.warehouse.name} carries a net variance of ${round2(total)}`,
 type: 'COUNT_VARIANCE',
 priority: 'MEDIUM',
 data,
 });
 } catch {
 // Advisory only.
 }
 return { totalVarianceValue: round2(total) };
 }

 async productCosts(itemIds[])> {
 const items = await prisma.stockCountItem.findMany({
 where},
 select} },
 });
 return new Map(items.map((item) => [item.productId, item.product.costPrice]));
 }
}

/** Variances above this need an explicit override before posting. */
export const DEFAULT_VARIANCE_TOLERANCE_PERCENT = 5;

export const stockCountService = new StockCountService();
