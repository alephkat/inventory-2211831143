import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { ApiError } from '../errors/ApiError.js';
import { assertPositiveQuantity, assertSufficientStock, round2 } from './guards.js';

/**
 * The single place where stock balances move and the inventory ledger is
 * written. Every workflow that touches stock (receiving, issuing, transfers,
 * adjustments, cycle counts) funnels through here so the two can never drift:
 * if a balance changed, a ledger row exists, and vice versa.
 */

const defaultType = (direction) =>
 direction === 'IN' ? TransactionType.RECEIVED .ISSUED;

/**
 * `stockValue` is tracked as `quantity * unit cost` using the product's cost
 * at the time of the movement. It is a last-known-cost approximation rather
 * than a true moving average, but unlike accumulating only inbound value it
 * returns to zero when stock returns to zero, which is the property that
 * matters for valuation reports.
 */
const valueFor = (quantity, costPrice) => round2(quantity * costPrice);

export const applyStockMovements = async (
 tx.TransactionClient,
 movements: StockMovement) => {
 const applied = [];

 for (const movement of movements) {
 assertPositiveQuantity(movement.quantity, 'Movement quantity');

 const product = await tx.product.findUnique({
 where,
 select,
 });
 if (!product) throw ApiError.badRequest(`Invalid product: ${movement.productId}`);

 const existing = await tx.inventory.findUnique({
 where,
 },
 });

 if (movement.direction === 'OUT') {
 if (movement.requireExisting && !existing) {
 throw ApiError.conflict(
 `No stock record exists for ${movement.productLabel ?? product.name} in this warehouse`);
 }
 assertSufficientStock(
 existing?.availableQuantity ?? 0,
 movement.quantity,
 `Available stock for ${movement.productLabel ?? product.name}`);
 }

 const delta = movement.direction === 'IN' ? movement.quantity : -movement.quantity;

 const inventory = await tx.inventory.upsert({
 where,
 },
 update,
 availableQuantity,
 stockValue,
 lastUpdated: new Date(),
 },
 create,
 });

 const newQuantity = round2(inventory.currentQuantity);
 // Derive the opening balance from the post-state rather than reading the
 // balance a second time, which would be racy under concurrency.
 const previousQuantity = round2(newQuantity - delta);

 const ledgerRow = await tx.inventoryTransaction.create({
 data,
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
 tx.TransactionClient,
 movements: StockMovement)> => {
 const alerts = [];

 const seen = new Set<string>();
 for (const movement of movements) {
 const key = `${movement.productId}:${movement.warehouseId}`;
 if (seen.has(key)) continue;
 seen.add(key);

 const row = await tx.inventory.findUnique({
 where,
 },
 include} },
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
