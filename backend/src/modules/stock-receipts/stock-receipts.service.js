import { ReceiptStatus, TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { documentNumber } from '../../shared/utils/document-number.js';
import { notificationService } from '../notifications/notifications.service.js';
import { applyStockMovements, assertLinesPresent, assertNoDuplicateLines, assertPositiveQuantity, assertRejectionReason, findLowStockAlerts, isFullyReceived, priceLines, remainingPurchaseQuantity, runTransition, WORKFLOW_RESOURCE } from '../../shared/workflow/index.js';
/**
 * Receiving: goods arriving into a warehouse.
 *
 * A receipt can stand alone (an ad-hoc delivery against a supplier) or hang
 * off a purchase order. In the purchase-order case the two are reconciled
 * line by line: nothing can be received beyond the outstanding order
 * quantity, and the order advances to PARTIALLY_RECEIVED or RECEIVED as the
 * lines fill.
 *
 *   PENDING -> APPROVED -> RECEIVED | PARTIALLY_RECEIVED
 */
const RECEIPT_INCLUDE = {
    warehouse: { select: { id: true, name: true, code: true } },
    supplier: { select: { id: true, name: true, code: true } },
    purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
    items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
    receivedBy: { select: { id: true, fullName: true } },
    approvedBy: { select: { id: true, fullName: true } },
};
export class StockReceiptService {
    async list(params) {
        const { page, limit, status, warehouseId, supplierId, purchaseOrderId } = params;
        const where = {};
        if (status)
            where.status = status;
        if (warehouseId)
            where.warehouseId = warehouseId;
        if (supplierId)
            where.supplierId = supplierId;
        if (purchaseOrderId)
            where.purchaseOrderId = purchaseOrderId;
        const [items, total] = await Promise.all([
            prisma.stockReceipt.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: RECEIPT_INCLUDE,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockReceipt.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    async get(id) {
        const receipt = await prisma.stockReceipt.findUnique({
            where: { id },
            include: RECEIPT_INCLUDE,
        });
        if (!receipt)
            throw ApiError.notFound('Stock receipt not found');
        return receipt;
    }
    async create(data, userId) {
        assertLinesPresent(data.items, 'Receipt line item');
        assertNoDuplicateLines(data.items, (line) => line.purchaseOrderItemId ?? line.productId, 'receipt line');
        for (const line of data.items) {
            assertPositiveQuantity(line.receivedQuantity, 'Received quantity');
        }
        if (!data.supplierId) {
            throw ApiError.badRequest('A receipt must name the supplier it is receiving from');
        }
        const supplier = await prisma.supplier.findUnique({
            where: { id: data.supplierId },
            select: { id: true, name: true, status: true },
        });
        if (!supplier)
            throw ApiError.badRequest('Invalid supplier');
        if (supplier.status !== 'ACTIVE') {
            throw ApiError.badRequest(`Goods cannot be received from a ${supplier.status.toLowerCase().replace(/_/g, ' ')} supplier`);
        }
        const warehouse = await prisma.warehouse.findUnique({
            where: { id: data.warehouseId },
            select: { id: true, isActive: true },
        });
        if (!warehouse)
            throw ApiError.badRequest('Invalid warehouse');
        if (!warehouse.isActive)
            throw ApiError.badRequest('Cannot receive into an inactive warehouse');
        const productIds = [...new Set(data.items.map((line) => line.productId))];
        const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
        if (products.length !== productIds.length) {
            throw ApiError.badRequest('One or more receipt lines reference an unknown product');
        }
        const { priced, totals } = priceLines(data.items.map((line) => ({
            quantity: line.receivedQuantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            taxPercent: line.taxPercent,
        })));
        const receiptNumber = documentNumber('RCPT');
        const receipt = await prisma.stockReceipt.create({
            data: {
                receiptNumber,
                supplierId: data.supplierId,
                warehouseId: data.warehouseId,
                status: ReceiptStatus.PENDING,
                notes: data.notes ?? null,
                subtotal: totals.subtotal,
                taxAmount: totals.taxAmount,
                discountAmount: totals.discountAmount,
                totalAmount: totals.total,
                items: {
                    create: data.items.map((line, index) => ({
                        productId: line.productId,
                        receivedQuantity: line.receivedQuantity,
                        unitPrice: priced[index].unitPrice,
                        discountPercent: priced[index].discountPercent,
                        discountAmount: priced[index].discountAmount,
                        taxPercent: priced[index].taxPercent,
                        taxAmount: priced[index].taxAmount,
                        totalPrice: priced[index].total,
                        batchNumber: line.batchNumber ?? null,
                        expiryDate: line.expiryDate ?? null,
                        manufacturingDate: line.manufacturingDate ?? null,
                        serialNumbers: line.serialNumbers ?? null,
                    })),
                },
            },
        });
        await createAuditLog({
            userId,
            action: 'CREATE',
            resourceType: WORKFLOW_RESOURCE.receipt,
            resourceId: receipt.id,
            newValues: { status: ReceiptStatus.PENDING, receiptNumber, lineCount: data.items.length },
        });
        return this.get(receipt.id);
    }
    /**
     * Approving authorises the goods to be booked in. Stock is not touched
     * here: a receipt can be approved now and physically received later.
     */
    async approve(id, userId) {
        const receipt = await this.get(id);
        await runTransition({
            workflow: 'receipt',
            model: 'stockReceipt',
            entityId: id,
            from: receipt.status,
            to: ReceiptStatus.APPROVED,
            verb: 'approve',
            actorId: userId,
            reference: receipt.receiptNumber,
            patch: { approvedById: userId, approvedAt: new Date() },
        });
        return this.get(id);
    }
    /**
     * Book the goods in. When the receipt was raised against a purchase order
     * this also advances that order, and stock is only credited here.
     */
    async receive(id, userId, options = {}) {
        const receipt = await this.get(id);
        await runTransition({
            workflow: 'receipt',
            model: 'stockReceipt',
            entityId: id,
            from: receipt.status,
            to: ReceiptStatus.RECEIVED,
            verb: 'receive',
            actorId: userId,
            reference: receipt.receiptNumber,
            reason: options.notes ?? null,
            details: { warehouseId: receipt.warehouseId, lineCount: receipt.items.length },
            patch: { receivedById: userId, receivedAt: new Date() },
            sideEffects: async (tx) => {
                await applyStockMovements(tx, receipt.items.map((item) => ({
                    productId: item.productId,
                    warehouseId: receipt.warehouseId,
                    quantity: item.receivedQuantity,
                    direction: 'IN',
                    type: TransactionType.RECEIVED,
                    reason: `Stock receipt ${receipt.receiptNumber}`,
                    referenceNumber: receipt.receiptNumber,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    performedById: userId,
                    productLabel: item.product?.name,
                })));
            },
        });
        if (receipt.purchaseOrderId) {
            await this.advancePurchaseOrder(receipt.purchaseOrderId, userId);
        }
        await this.raisePostReceiptAlerts(receipt, userId);
        return this.get(id);
    }
    /**
     * Receipt part of a delivery against a purchase order. The PO's remaining
     * quantity is the hard ceiling: a short or over delivery is a data-entry
     * error that must be corrected, not a silent over-receipt.
     */
    async receiveAgainstPurchaseOrder(purchaseOrderId, userId, input) {
        assertLinesPresent(input.items, 'Receipt line item');
        assertNoDuplicateLines(input.items, (line) => line.purchaseOrderItemId, 'receipt line');
        for (const line of input.items) {
            assertPositiveQuantity(line.receivedQuantity, 'Received quantity');
        }
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            include: { items: { include: { product: true } } },
        });
        if (!order)
            throw ApiError.notFound('Purchase order not found');
        if (order.status !== 'APPROVED' && order.status !== 'PARTIALLY_RECEIVED') {
            throw ApiError.conflict(`Purchase order ${order.orderNumber} is ${order.status.toLowerCase().replace(/_/g, ' ')}; only approved orders can be received against`);
        }
        for (const line of input.items) {
            const poItem = order.items.find((item) => item.id === line.purchaseOrderItemId);
            if (!poItem)
                throw ApiError.badRequest(`Unknown purchase order line: ${line.purchaseOrderItemId}`);
            const outstanding = remainingPurchaseQuantity(poItem.quantity, poItem.receivedQuantity);
            if (line.receivedQuantity > outstanding) {
                throw ApiError.conflict(`Receiving ${line.receivedQuantity} exceeds the ${outstanding} outstanding for ${poItem.product.name}`);
            }
        }
        const { priced, totals } = priceLines(input.items.map((line) => {
            const poItem = order.items.find((item) => item.id === line.purchaseOrderItemId);
            return {
                quantity: line.receivedQuantity,
                unitPrice: poItem.unitPrice,
                discountPercent: poItem.discountPercent,
                taxPercent: poItem.taxPercent,
            };
        }));
        const receiptNumber = documentNumber('RCPT');
        const receipt = await prisma.stockReceipt.create({
            data: {
                receiptNumber,
                purchaseOrderId: order.id,
                supplierId: order.supplierId,
                warehouseId: input.warehouseId,
                status: ReceiptStatus.APPROVED,
                notes: input.notes ?? null,
                subtotal: totals.subtotal,
                taxAmount: totals.taxAmount,
                discountAmount: totals.discountAmount,
                totalAmount: totals.total,
                approvedById: userId,
                approvedAt: new Date(),
                items: {
                    create: input.items.map((line, index) => {
                        const poItem = order.items.find((item) => item.id === line.purchaseOrderItemId);
                        return {
                            productId: poItem.productId,
                            purchaseOrderItemId: line.purchaseOrderItemId,
                            orderedQuantity: remainingPurchaseQuantity(poItem.quantity, poItem.receivedQuantity),
                            receivedQuantity: line.receivedQuantity,
                            unitPrice: priced[index].unitPrice,
                            discountPercent: priced[index].discountPercent,
                            discountAmount: priced[index].discountAmount,
                            taxPercent: priced[index].taxPercent,
                            taxAmount: priced[index].taxAmount,
                            totalPrice: priced[index].total,
                            batchNumber: line.batchNumber ?? null,
                            expiryDate: line.expiryDate ?? null,
                            manufacturingDate: line.manufacturingDate ?? null,
                            serialNumbers: line.serialNumbers ?? null,
                        };
                    }),
                },
            },
        });
        return this.receive(receipt.id, userId, { notes: input.notes });
    }
    async reject(id, userId, reason) {
        const receipt = await this.get(id);
        const rejectionReason = assertRejectionReason(reason);
        await runTransition({
            workflow: 'receipt',
            model: 'stockReceipt',
            entityId: id,
            from: receipt.status,
            to: ReceiptStatus.REJECTED,
            verb: 'reject',
            actorId: userId,
            reference: receipt.receiptNumber,
            reason: rejectionReason,
            patch: { approvedById: userId, approvedAt: new Date(), rejectionReason },
        });
        return this.get(id);
    }
    async cancel(id, userId, reason) {
        const receipt = await this.get(id);
        await runTransition({
            workflow: 'receipt',
            model: 'stockReceipt',
            entityId: id,
            from: receipt.status,
            to: ReceiptStatus.CANCELLED,
            verb: 'cancel',
            actorId: userId,
            reference: receipt.receiptNumber,
            reason: reason ?? null,
        });
        return this.get(id);
    }
    async ledger(id) {
        const receipt = await this.get(id);
        return prisma.inventoryTransaction.findMany({
            where: { referenceNumber: receipt.receiptNumber, type: TransactionType.RECEIVED },
            include: {
                product: { select: { sku: true, name: true, unit: true } },
                warehouse: { select: { id: true, name: true } },
                performedBy: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    /**
     * Move the purchase order forward once a receipt has been booked. The
     * decision is made on post-receipt quantities, and the update is guarded on
     * the status we just read, so a concurrent receipt cannot double-advance or
     * skip the PARTIALLY_RECEIVED step.
     */
    async advancePurchaseOrder(purchaseOrderId, userId) {
        await prisma.$transaction(async (tx) => {
            const order = await tx.purchaseOrder.findUnique({
                where: { id: purchaseOrderId },
                include: { items: true },
            });
            if (!order)
                return;
            const fully = isFullyReceived(order.items);
            // A fully received order goes straight to COMPLETED; the intermediate
            // RECEIVED state would only ever be observed for an instant.
            const target = fully ? 'COMPLETED' : 'PARTIALLY_RECEIVED';
            const { count } = await tx.purchaseOrder.updateMany({
                where: { id: purchaseOrderId, status: order.status },
                data: { status: target },
            });
            if (count === 0) {
                // Another receipt advanced the order first; its own transition will
                // have set the correct final status.
                return;
            }
            await createAuditLog({
                userId,
                action: 'RECEIVE',
                resourceType: WORKFLOW_RESOURCE.purchaseOrder,
                resourceId: purchaseOrderId,
                oldValues: { status: order.status },
                newValues: { status: target, orderNumber: order.orderNumber },
            });
        });
    }
    async raisePostReceiptAlerts(receipt, userId) {
        try {
            const movements = receipt.items.map((item) => ({
                productId: item.productId,
                warehouseId: receipt.warehouseId,
                quantity: item.receivedQuantity,
                direction: 'IN',
                reason: `Stock receipt ${receipt.receiptNumber}`,
                performedById: userId,
                productLabel: item.product?.name,
            }));
            const alerts = await prisma.$transaction((tx) => findLowStockAlerts(tx, movements));
            for (const alert of alerts) {
                await notificationService.dispatch(userId, {
                    title: 'Low Stock Alert',
                    body: `Stock in ${receipt.warehouse?.name ?? receipt.warehouseId} is ${alert.currentQuantity} after receipt ${receipt.receiptNumber}`,
                    type: 'LOW_STOCK',
                    priority: 'HIGH',
                    data: { ...alert, receiptId: receipt.id },
                });
            }
            // Newly received stock that is already close to expiry is worth a
            // warning now, not when it fails to sell.
            for (const item of receipt.items) {
                if (!item.expiryDate)
                    continue;
                const days = Math.ceil((item.expiryDate.getTime() - Date.now()) / 86_400_000);
                if (days > 30)
                    continue;
                await notificationService.dispatch(userId, {
                    title: 'Expiring Stock Received',
                    body: `Received ${item.receivedQuantity} of ${item.product?.name ?? item.productId} expiring in ${days} day(s)`,
                    type: 'EXPIRING',
                    priority: days <= 7 ? 'HIGH' : 'MEDIUM',
                    data: { receiptId: receipt.id, productId: item.productId, daysUntilExpiry: days },
                });
            }
        }
        catch {
            // Alerts are advisory; the receipt has already been booked in.
        }
    }
}
export const stockReceiptService = new StockReceiptService();
