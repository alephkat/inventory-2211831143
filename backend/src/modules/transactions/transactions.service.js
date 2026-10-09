import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { round2 } from '../../shared/workflow/guards.js';
import { TransactionStatus, AuditAction } from '@prisma/client';
/**
 * Stock impact of each ledger type. Keyed by the Prisma enum, not by a
 * lowercased string: `TransactionType` values are UPPERCASE, so a lowercase
 * lookup silently yields `undefined` and turns every delta into `NaN`.
 * The map is exhaustive on purpose, and `directionFor` rejects anything
 * outside it rather than defaulting.
 */
const TYPE_DIRECTIONS = {
    RECEIVED: 1,
    RETURNED: 1,
    ISSUED: -1,
    TRANSFERRED: -1,
    ADJUSTED: -1,
    DAMAGED: -1,
    LOST: -1,
    EXPIRED: -1,
};
/**
 * Ledger type -> audit action.
 *
 * These are two different enums and the names do not line up: a `RECEIVED`
 * movement is audited as `RECEIVE`, and `RETURNED` as `RETURN`. Writing the
 * transaction type straight into `AuditLog.action` would put a value the enum
 * does not contain into the column, so the mapping is explicit and exhaustive.
 */
const AUDIT_ACTIONS = {
    RECEIVED: AuditAction.RECEIVE,
    RETURNED: AuditAction.RETURN,
    ISSUED: AuditAction.ISSUE,
    TRANSFERRED: AuditAction.TRANSFER,
    ADJUSTED: AuditAction.ADJUST,
    DAMAGED: AuditAction.ADJUST,
    LOST: AuditAction.ADJUST,
    EXPIRED: AuditAction.ADJUST,
};
const directionFor = (type) => {
    const direction = TYPE_DIRECTIONS[type];
    if (direction === undefined) {
        throw ApiError.badRequest('Invalid transaction type for this endpoint. Use transfers or adjustments.');
    }
    return direction;
};
/**
 * The request schema accepts lowercase verbs (`received`, `issued`,
 * `returned`) because that reads better in JSON, while the `TransactionType`
 * enum is UPPERCASE. Normalising here is what keeps every lookup below —
 * direction, audit action, the Prisma write — from missing on a silent `NaN`
 * or an invalid enum value.
 */
const normalizeType = (value) => {
    const normalized = String(value).toUpperCase();
    if (TYPE_DIRECTIONS[normalized] === undefined) {
        throw ApiError.badRequest(`Invalid transaction type "${value}". Expected one of: ${Object.keys(TYPE_DIRECTIONS).join(', ')}.`);
    }
    return normalized;
};
export class TransactionService {
    async list(params) {
        const { page, limit, productId, warehouseId, type, status } = params;
        const where = {};
        if (productId)
            where.productId = productId;
        if (warehouseId)
            where.warehouseId = warehouseId;
        if (type)
            where.type = normalizeType(type);
        if (status)
            where.status = status;
        const [items, total] = await Promise.all([
            prisma.inventoryTransaction.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    product: true,
                    warehouse: true,
                    performedBy: { select: { id: true, fullName: true } },
                    approvedBy: { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.inventoryTransaction.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    async get(id) {
        const t = await prisma.inventoryTransaction.findUnique({
            where: { id },
            include: { product: true, warehouse: true, performedBy: { select: { id: true, fullName: true } }, approvedBy: { select: { id: true, fullName: true } } },
        });
        if (!t)
            throw ApiError.notFound('Transaction not found');
        return t;
    }
    async create(data, userId) {
        const type = normalizeType(data.type);
        const direction = directionFor(type);
        const product = await prisma.product.findUnique({ where: { id: data.productId } });
        if (!product)
            throw ApiError.badRequest('Invalid product');
        const warehouse = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
        if (!warehouse)
            throw ApiError.badRequest('Invalid warehouse');
        if (data.quantity <= 0)
            throw ApiError.badRequest('Quantity must be greater than zero');
        const inventory = await prisma.inventory.upsert({
            where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
            update: {},
            create: {
                productId: data.productId,
                warehouseId: data.warehouseId,
                minQuantity: product.reorderLevel,
                reorderQuantity: product.reorderLevel,
                stockValue: 0,
            },
        });
        const canApprove = await this.userCanApprove(userId);
        const previousQuantity = inventory.currentQuantity;
        const newQuantity = previousQuantity + direction * data.quantity;
        const status = canApprove ? TransactionStatus.COMPLETED : TransactionStatus.PENDING;
        if (canApprove) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: {
                    currentQuantity: { increment: direction * data.quantity },
                    availableQuantity: { increment: direction * data.quantity },
                    stockValue: { increment: round2(direction * data.quantity * product.costPrice) },
                    lastUpdated: new Date(),
                },
            });
        }
        const tx = await prisma.inventoryTransaction.create({
            data: {
                productId: data.productId,
                warehouseId: data.warehouseId,
                type,
                status,
                quantity: data.quantity,
                previousQuantity,
                newQuantity,
                referenceNumber: data.referenceNumber,
                reason: data.reason,
                batchNumber: data.batchNumber,
                expiryDate: data.expiryDate,
                performedById: userId,
            },
        });
        await createAuditLog({
            userId,
            action: AUDIT_ACTIONS[type],
            resourceType: 'inventory_transaction',
            resourceId: tx.id,
            oldValues: { currentQuantity: previousQuantity },
            newValues: { newQuantity, status },
        });
        return this.get(tx.id);
    }
    async approve(id, userId) {
        const tx = await this.get(id);
        if (tx.status !== TransactionStatus.PENDING) {
            throw ApiError.badRequest('Only pending transactions can be approved');
        }
        const inventory = await prisma.inventory.findUnique({
            where: { productId_warehouseId: { productId: tx.productId, warehouseId: tx.warehouseId } },
        });
        if (!inventory)
            throw ApiError.notFound('Inventory not found');
        const product = await prisma.product.findUnique({
            where: { id: tx.productId },
            select: { costPrice: true },
        });
        const direction = directionFor(tx.type);
        if (direction < 0 && inventory.availableQuantity < tx.quantity) {
            throw ApiError.badRequest('Insufficient available stock for this transaction');
        }
        await prisma.$transaction(async (transaction) => {
            await transaction.inventory.update({
                where: { id: inventory.id },
                data: {
                    currentQuantity: { increment: direction * tx.quantity },
                    availableQuantity: { increment: direction * tx.quantity },
                    stockValue: { increment: round2(direction * tx.quantity * (product?.costPrice ?? 0)) },
                    lastUpdated: new Date(),
                },
            });
            await transaction.inventoryTransaction.update({
                where: { id },
                data: { status: TransactionStatus.COMPLETED, approvedById: userId, approvedAt: new Date() },
            });
        });
        await createAuditLog({ userId, action: 'APPROVE', resourceType: 'inventory_transaction', resourceId: id });
        return this.get(id);
    }
    async reject(id, userId, reason) {
        const tx = await this.get(id);
        if (tx.status !== TransactionStatus.PENDING) {
            throw ApiError.badRequest('Only pending transactions can be rejected');
        }
        await prisma.inventoryTransaction.update({
            where: { id },
            data: { status: TransactionStatus.REJECTED, approvedById: userId, approvedAt: new Date(), rejectionReason: reason },
        });
        await createAuditLog({ userId, action: 'REJECT', resourceType: 'inventory_transaction', resourceId: id });
        return this.get(id);
    }
    async userCanApprove(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
        });
        return !!user && user.role.permissions.some((rp) => rp.permission.value === 'approve_transactions');
    }
}
export const transactionService = new TransactionService();
