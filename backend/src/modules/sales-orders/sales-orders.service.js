import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { applyStockMovements } from '../../shared/workflow/stock.js';
import { OrderStatus, TransactionType } from '@prisma/client';
export class SalesOrderService {
    async list(params) {
        const { page, limit, status, customerId, search } = params;
        const where = {};
        if (status)
            where.status = status;
        if (customerId)
            where.customerId = customerId;
        if (search) {
            where.OR = [{ orderNumber: { contains: search } }, { customer: { name: { contains: search } } }];
        }
        const [items, total] = await Promise.all([
            prisma.salesOrder.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { customer: true, warehouse: true, items: { include: { product: true } }, createdBy: { select: { id: true, fullName: true } }, approvedBy: { select: { id: true, fullName: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.salesOrder.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    async get(id) {
        const so = await prisma.salesOrder.findUnique({
            where: { id },
            include: { customer: true, warehouse: true, items: { include: { product: true } }, createdBy: { select: { id: true, fullName: true } }, approvedBy: { select: { id: true, fullName: true } } },
        });
        if (!so)
            throw ApiError.notFound('Sales order not found');
        return so;
    }
    async computeTotals(id) {
        const items = await prisma.salesOrderItem.findMany({ where: { salesOrderId: id } });
        const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
        const taxAmount = 0;
        await prisma.salesOrder.update({ where: { id }, data: { subtotal, taxAmount, totalAmount: subtotal + taxAmount } });
        return { subtotal, taxAmount, total: subtotal + taxAmount };
    }
    async generateOrderNumber() {
        const date = new Date();
        const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const last = await prisma.salesOrder.findFirst({ where: { orderNumber: { startsWith: `SO-${ymd}-` } }, orderBy: { orderNumber: 'desc' } });
        const seq = last ? parseInt(last.orderNumber.split('-').pop(), 10) + 1 : 1;
        return `SO-${ymd}-${String(seq).padStart(4, '0')}`;
    }
    async create(data, userId) {
        const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
        if (!customer)
            throw ApiError.badRequest('Invalid customer');
        const warehouse = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
        if (!warehouse)
            throw ApiError.badRequest('Invalid warehouse');
        if (!data.items.length)
            throw ApiError.badRequest('At least one line item is required');
        const orderNumber = await this.generateOrderNumber();
        const so = await prisma.salesOrder.create({
            data: {
                orderNumber,
                customerId: data.customerId,
                warehouseId: data.warehouseId,
                expectedDate: data.expectedDate,
                currency: data.currency ?? 'USD',
                createdById: userId,
            },
        });
        for (const item of data.items) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            if (!product)
                throw ApiError.badRequest(`Invalid product id: ${item.productId}`);
            const totalPrice = item.quantity * item.unitPrice;
            await prisma.salesOrderItem.create({
                data: { salesOrderId: so.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice },
            });
        }
        await this.computeTotals(so.id);
        await createAuditLog({ userId, action: 'CREATE', resourceType: 'sales_order', resourceId: so.id });
        return this.get(so.id);
    }
    async submit(id, userId) {
        const so = await this.get(id);
        if (so.status !== 'DRAFT')
            throw ApiError.badRequest('Only drafts can be submitted');
        await prisma.salesOrder.update({ where: { id }, data: { status: OrderStatus.PENDING } });
        await createAuditLog({ userId, action: 'APPROVE', resourceType: 'sales_order', resourceId: id, newValues: { status: 'PENDING' } });
        return this.get(id);
    }
    async approve(id, userId) {
        const so = await this.get(id);
        if (so.status !== 'PENDING')
            throw ApiError.badRequest('Only pending orders can be approved');
        await prisma.salesOrder.update({
            where: { id },
            data: { status: OrderStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
        });
        await createAuditLog({ userId, action: 'APPROVE', resourceType: 'sales_order', resourceId: id });
        return this.get(id);
    }
    async issue(id, userId, items) {
        const so = await this.get(id);
        if (so.status !== 'APPROVED')
            throw ApiError.badRequest('Only approved orders can be issued');
        if (!items.length)
            throw ApiError.badRequest('Specify items to issue');
        await prisma.$transaction(async (tx) => {
            const lines = [];
            for (const ri of items) {
                const item = await tx.salesOrderItem.findUnique({ where: { id: ri.itemId }, include: { product: true } });
                if (!item)
                    throw ApiError.badRequest(`Invalid item id: ${ri.itemId}`);
                if (item.salesOrderId !== so.id)
                    throw ApiError.badRequest('Item does not belong to this order');
                if (ri.quantity <= 0)
                    throw ApiError.badRequest('Issue quantity must be > 0');
                if (item.fulfilledQuantity + ri.quantity > item.quantity) {
                    throw ApiError.badRequest(`Cannot issue more than ordered quantity for item ${item.productId}`);
                }
                lines.push({
                    itemId: item.id,
                    productId: item.productId,
                    productName: item.product.name,
                    quantity: ri.quantity,
                    remaining: item.quantity - (item.fulfilledQuantity + ri.quantity),
                });
            }
            // Routed through the shared helper rather than updating Inventory here by
            // hand: stockValue is carried at the product's *cost* price, and writing
            // it from the order line's sale price drove valuations negative.
            await applyStockMovements(tx, lines.map((line) => ({
                productId: line.productId,
                warehouseId: so.warehouseId,
                quantity: line.quantity,
                direction: 'OUT',
                type: TransactionType.ISSUED,
                reason: `SO issue #${so.orderNumber}`,
                referenceNumber: so.orderNumber,
                performedById: userId,
                requireExisting: true,
                productLabel: line.productName,
            })));
            for (const line of lines) {
                await tx.salesOrderItem.update({
                    where: { id: line.itemId },
                    data: { fulfilledQuantity: { increment: line.quantity } },
                });
            }
            const newStatus = lines.every((line) => line.remaining <= 0) ? OrderStatus.COMPLETED : OrderStatus.ISSUED;
            await tx.salesOrder.update({
                where: { id },
                data: { status: newStatus, shippedAt: new Date() },
            });
        });
        await createAuditLog({ userId, action: 'ISSUE', resourceType: 'sales_order', resourceId: id });
        return this.get(id);
    }
    async ship(id, userId) {
        const so = await this.get(id);
        if (!['APPROVED', 'ISSUED'].includes(so.status))
            throw ApiError.badRequest('Order cannot be shipped in current state');
        await prisma.salesOrder.update({ where: { id }, data: { shippedAt: new Date() } });
        await createAuditLog({ userId, action: 'UPDATE', resourceType: 'sales_order', resourceId: id, newValues: { shippedAt: new Date() } });
        return this.get(id);
    }
    async deliver(id, userId) {
        const so = await this.get(id);
        if (so.status !== 'ISSUED' && so.status !== 'APPROVED')
            throw ApiError.badRequest('Order cannot be delivered in current state');
        await prisma.salesOrder.update({ where: { id }, data: { deliveredAt: new Date(), status: OrderStatus.COMPLETED } });
        await createAuditLog({ userId, action: 'UPDATE', resourceType: 'sales_order', resourceId: id });
        return this.get(id);
    }
    async cancel(id, userId) {
        const so = await this.get(id);
        if (['COMPLETED', 'CANCELLED'].includes(so.status))
            throw ApiError.badRequest('Cannot cancel this order');
        await prisma.salesOrder.update({ where: { id }, data: { status: OrderStatus.CANCELLED } });
        await createAuditLog({ userId, action: 'DELETE', resourceType: 'sales_order', resourceId: id });
        return this.get(id);
    }
    async addItem(id, data, userId) {
        const so = await this.get(id);
        if (so.status !== 'DRAFT')
            throw ApiError.badRequest('Can only modify drafts');
        const product = await prisma.product.findUnique({ where: { id: data.productId } });
        if (!product)
            throw ApiError.badRequest('Invalid product');
        const item = await prisma.salesOrderItem.create({
            data: { salesOrderId: so.id, productId: data.productId, quantity: data.quantity, unitPrice: data.unitPrice, totalPrice: data.quantity * data.unitPrice },
        });
        await this.computeTotals(so.id);
        await createAuditLog({ userId, action: 'UPDATE', resourceType: 'sales_order', resourceId: so.id });
        return item;
    }
    async removeItem(id, itemId, userId) {
        const so = await this.get(id);
        if (so.status !== 'DRAFT')
            throw ApiError.badRequest('Can only modify drafts');
        await prisma.salesOrderItem.delete({ where: { id: itemId } });
        await this.computeTotals(so.id);
        await createAuditLog({ userId, action: 'UPDATE', resourceType: 'sales_order', resourceId: so.id });
        return { success: true, message: 'Item removed' };
    }
}
export const salesOrderService = new SalesOrderService();
