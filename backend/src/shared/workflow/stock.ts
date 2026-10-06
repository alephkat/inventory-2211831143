import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { ApiError } from '../errors/ApiError';
import { assertPositiveQuantity, assertSufficientStock, round2 } from './guards';

/**
 * The single place where stock balances move and the inventory ledger is
 * written. Every workflow that touches stock (receiving, issuing, transfers,
 * adjustments, cycle counts) funnels through here so the two can never drift:
 * if a balance changed, a ledger row exists, and vice versa.
 */

export type MovementDirection = 'IN' | 'OUT';

export interface StockMovement {
  productId: string;
  warehouseId: string;
  /** Always a positive magnitude; `direction` carries the sign. */
  quantity: number;
  direction: MovementDirection;
  /** Ledger row type. Defaults to RECEIVED/ISSUED based on direction. */
  type?: TransactionType;
  reason: string;
  referenceNumber?: string | null;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  performedById: string;
  relatedTransferId?: string | null;
  /** Set when the movement must not create an inventory row from scratch. */
  requireExisting?: boolean;
  /** Product name/unit, used only to build readable conflict messages. */
  productLabel?: string;
}

export interface AppliedMovement {
  productId: string;
  warehouseId: string;
  previousQuantity: number;
  newQuantity: number;
  transactionId: string;
}

const defaultType = (direction: MovementDirection): TransactionType =>
  direction === 'IN' ? TransactionType.RECEIVED : TransactionType.ISSUED;

/**
 * `stockValue` is tracked as `quantity * unit cost` using the product's cost
 * at the time of the movement. It is a last-known-cost approximation rather
 * than a true moving average, but unlike accumulating only inbound value it
 * returns to zero when stock returns to zero, which is the property that
 * matters for valuation reports.
 */
const valueFor = (quantity: number, costPrice: number): number => round2(quantity * costPrice);

export const applyStockMovements = async (
  tx: Prisma.TransactionClient,
  movements: readonly StockMovement[],
): Promise<AppliedMovement[]> => {
  const applied: AppliedMovement[] = [];

  for (const movement of movements) {
    assertPositiveQuantity(movement.quantity, 'Movement quantity');

    const product = await tx.product.findUnique({
      where: { id: movement.productId },
      select: { id: true, name: true, unit: true, costPrice: true },
    });
    if (!product) throw ApiError.badRequest(`Invalid product: ${movement.productId}`);

    const existing = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
        },
      },
    });

    if (movement.direction === 'OUT') {
      if (movement.requireExisting && !existing) {
        throw ApiError.conflict(
          `No stock record exists for ${movement.productLabel ?? product.name} in this warehouse`,
        );
      }
      assertSufficientStock(
        existing?.availableQuantity ?? 0,
        movement.quantity,
        `Available stock for ${movement.productLabel ?? product.name}`,
      );
    }

    const delta = movement.direction === 'IN' ? movement.quantity : -movement.quantity;

    const inventory = await tx.inventory.upsert({
      where: {
        productId_warehouseId: {
          productId: movement.productId,
          warehouseId: movement.warehouseId,
        },
      },
      update: {
        currentQuantity: { increment: delta },
        availableQuantity: { increment: delta },
        stockValue: {
          increment: round2(delta * product.costPrice),
        },
        lastUpdated: new Date(),
      },
      create: {
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        currentQuantity: movement.quantity,
        availableQuantity: movement.quantity,
        stockValue: valueFor(movement.quantity, product.costPrice),
      },
    });

    const newQuantity = round2(inventory.currentQuantity);
    // Derive the opening balance from the post-state rather than reading the
    // balance a second time, which would be racy under concurrency.
    const previousQuantity = round2(newQuantity - delta);

    const ledgerRow = await tx.inventoryTransaction.create({
      data: {
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        type: movement.type ?? defaultType(movement.direction),
        status: TransactionStatus.COMPLETED,
        quantity: movement.quantity,
        previousQuantity,
        newQuantity,
        reason: movement.reason,
        referenceNumber: movement.referenceNumber ?? null,
        batchNumber: movement.batchNumber ?? null,
        expiryDate: movement.expiryDate ?? null,
        performedById: movement.performedById,
        relatedTransferId: movement.relatedTransferId ?? null,
      },
    });

    applied.push({
      productId: movement.productId,
      warehouseId: movement.warehouseId,
      previousQuantity,
      newQuantity,
      transactionId: ledgerRow.id,
    });
  }

  return applied;
};

/**
 * Low-stock detection, run after a movement has settled. Returns the
 * products that have fallen to or below their reorder level so the caller
 * can raise a notification.
 */
export const findLowStockAlerts = async (
  tx: Prisma.TransactionClient,
  movements: readonly StockMovement[],
): Promise<Array<{ productId: string; warehouseId: string; currentQuantity: number; reorderLevel: number }>> => {
  const alerts: Array<{
    productId: string;
    warehouseId: string;
    currentQuantity: number;
    reorderLevel: number;
  }> = [];

  const seen = new Set<string>();
  for (const movement of movements) {
    const key = `${movement.productId}:${movement.warehouseId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const row = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId },
      },
      include: { product: { select: { reorderLevel: true } } },
    });
    if (!row) continue;

    const threshold = row.minQuantity ?? row.product.reorderLevel;
    if (threshold > 0 && row.currentQuantity <= threshold) {
      alerts.push({
        productId: row.productId,
        warehouseId: row.warehouseId,
        currentQuantity: row.currentQuantity,
        reorderLevel: threshold,
      });
    }
  }

  return alerts;
};
