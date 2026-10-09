import { TransactionStatus, TransactionType } from '@prisma/client';
import { ApiError } from '../errors/ApiError.js';
import { assertPositiveQuantity, assertSufficientStock, round2 } from './guards.js';
const defaultType = (direction) => direction === 'IN' ? TransactionType.RECEIVED : TransactionType.ISSUED;
/**
 * `stockValue` is tracked as `quantity * unit cost` using the product's cost
 * at the time of the movement. It is a last-known-cost approximation rather
 * than a true moving average, but unlike accumulating only inbound value it
 * returns to zero when stock returns to zero, which is the property that
 * matters for valuation reports.
 */
const valueFor = (quantity, costPrice) => round2(quantity * costPrice);
export const applyStockMovements = async (tx, movements) => {
    const applied = [];
    for (const movement of movements) {
        assertPositiveQuantity(movement.quantity, 'Movement quantity');
        const product = await tx.product.findUnique({
            where: { id: movement.productId },
            select: { id: true, name: true, unit: true, costPrice: true },
        });
        if (!product)
            throw ApiError.badRequest(`Invalid product: ${movement.productId}`);
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
                throw ApiError.conflict(`No stock record exists for ${movement.productLabel ?? product.name} in this warehouse`);
            }
            assertSufficientStock(existing?.availableQuantity ?? 0, movement.quantity, `Available stock for ${movement.productLabel ?? product.name}`);
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
export const findLowStockAlerts = async (tx, movements) => {
    const alerts = [];
    const seen = new Set();
    for (const movement of movements) {
        const key = `${movement.productId}:${movement.warehouseId}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const row = await tx.inventory.findUnique({
            where: {
                productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId },
            },
            include: { product: { select: { reorderLevel: true } } },
        });
        if (!row)
            continue;
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
