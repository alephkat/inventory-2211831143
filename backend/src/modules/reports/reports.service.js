import { TransactionType } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
export class ReportService {
    /** Inventory valuation: per product + warehouse stock value. */
    async inventoryValuation(params) {
        const { page, limit, categoryId, warehouseId } = params;
        const where = {};
        if (categoryId)
            where.product = { categoryId };
        if (warehouseId)
            where.warehouseId = warehouseId;
        const [items, total, totals] = await Promise.all([
            prisma.inventory.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { product: { select: { name: true, sku: true, costPrice: true, category: { select: { name: true } }, supplier: { select: { name: true } } }, include: { category: true, supplier: true }, select: { name: true, sku: true, costPrice: true, category: { select: { name: true } }, supplier: { select: { name: true } } } }, warehouse: { select: { name: true } } },
                orderBy: { stockValue: 'desc' },
            }),
            prisma.inventory.count({ where }),
            prisma.inventory.aggregate({
                _sum: { stockValue: true, currentQuantity: true },
                where,
            }),
        ]);
        return {
            items: items.map((i) => ({
                productId: i.productId,
                productName: i.product?.name,
                sku: i.product?.sku,
                category: i.product?.category?.name,
                supplier: i.product?.supplier?.name,
                warehouse: i.warehouse?.name,
                quantity: i.currentQuantity,
                costPrice: i.product?.costPrice,
                stockValue: Number(i.stockValue),
            })),
            total,
            page,
            limit,
            summary: {
                totalValue: Number(totals._sum.stockValue ?? 0),
                totalQuantity: Number(totals._sum.currentQuantity ?? 0),
            },
        };
    }
    /** Stock movements list with filters. */
    async stockMovements(params) {
        const { page, limit, type, startDate, endDate, productId } = params;
        const where = {};
        if (type)
            where.type = type;
        if (productId)
            where.productId = productId;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = startDate;
            if (endDate)
                where.createdAt.lte = endDate;
        }
        const [items, total] = await Promise.all([
            prisma.inventoryTransaction.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { product: { select: { name: true, sku: true, unit: true } }, warehouse: { select: { name: true } }, performedBy: { select: { id: true, fullName: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.inventoryTransaction.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    /** Products expiring within a window. */
    async expiryReport(params) {
        const page = params.page ?? 1;
        const limit = params.limit ?? 50;
        const days = params.days ?? 90;
        const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const where = {
            expiryDate: { not: null, lte: threshold },
        };
        if (params.warehouseId)
            where.warehouseId = params.warehouseId;
        if (params.categoryId)
            where.categoryId = params.categoryId;
        const [items, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { category: { select: { name: true } }, warehouse: { select: { name: true } }, inventories: { where: params.warehouseId ? { warehouseId: params.warehouseId } : {} } },
                orderBy: { expiryDate: 'asc' },
            }),
            prisma.product.count({ where }),
        ]);
        return {
            items: items.map((p) => ({
                productId: p.id,
                name: p.name,
                sku: p.sku,
                batchNumber: p.batchNumber,
                expiryDate: p.expiryDate,
                daysUntilExpiry: p.expiryDate ? Math.ceil((p.expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null,
                currentStock: p.inventories.reduce((s, i) => s + Number(i.currentQuantity), 0),
                warehouse: p.warehouse?.name,
                category: p.category?.name,
            })),
            total,
            page,
            limit,
        };
    }
    /** Fast / slow moving products based on transaction volume. */
    async movingProducts(params) {
        const days = params.days ?? 90;
        const from = new Date();
        from.setDate(from.getDate() - days);
        const where = {
            type: TransactionType.ISSUED,
            status: 'COMPLETED',
            createdAt: { gte: from },
        };
        if (params.warehouseId)
            where.warehouseId = params.warehouseId;
        const rows = await prisma.inventoryTransaction.groupBy({
            by: ['productId'],
            where,
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 10,
        });
        const productIds = rows.map((r) => r.productId);
        const products = await prisma.product.findMany({ where: { id: { in: productIds } }, include: { inventories: true } });
        return rows.map((r) => {
            const p = products.find((pr) => pr.id === r.productId);
            const sold = Number(r._sum.quantity ?? 0);
            const stock = p ? p.inventories.reduce((s, i) => s + Number(i.currentQuantity), 0) : 0;
            return {
                productId: r.productId,
                productName: p?.name,
                sku: p?.sku,
                quantitySold: sold,
                revenue: sold * (p?.sellingPrice ?? 0),
                currentStock: stock,
                daysSinceMovement: 0,
            };
        });
    }
    /** Serialize a report row set to CSV. */
    toCsv(rows) {
        if (!rows.length)
            return '';
        const headers = Object.keys(rows[0]);
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [headers.map(escape).join(',')];
        for (const row of rows) {
            lines.push(headers.map((h) => escape(row[h])).join(','));
        }
        return lines.join('\n');
    }
}
export const reportService = new ReportService();
