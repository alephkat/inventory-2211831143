import { prisma } from '../../shared/config/database.js';
export class StockLevelService {
    /** Paginated list of inventory rows joined with product + warehouse. */
    async list(params) {
        const { page, limit, productId, warehouseId, search } = params;
        const where = {};
        if (productId)
            where.productId = productId;
        if (warehouseId)
            where.warehouseId = warehouseId;
        if (search) {
            where.OR = [
                { product: { name: { contains: search } } },
                { product: { sku: { contains: search } } },
                { warehouse: { name: { contains: search } } },
            ];
        }
        const [items, total] = await Promise.all([
            prisma.inventory.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                include: { product: { select: { name: true, sku: true, unit: true, costPrice: true, minQuantity: true, reorderLevel: true } }, warehouse: { select: { name: true } } },
                orderBy: { lastUpdated: 'desc' },
            }),
            prisma.inventory.count({ where }),
        ]);
        const mapped = items.map((i) => ({
            ...i,
            stockValue: i.currentQuantity * (i.product?.costPrice ?? 0),
        }));
        return { items: mapped, total, page, limit };
    }
    async get(productId, warehouseId) {
        return prisma.inventory.findUnique({
            where: { productId_warehouseId: { productId, warehouseId } },
            include: {
                product: { select: { name: true, sku: true, unit: true, costPrice: true, minQuantity: true, reorderLevel: true } },
                warehouse: true,
            },
        });
    }
    /** Low-stock summary: inventories where current <= reorder level. */
    async lowStock() {
        const rows = await prisma.$queryRaw `
      SELECT
        i."productId", p."name" AS "productName", p."sku" AS "sku",
        i."warehouseId", w."name" AS "warehouseName",
        i."currentQuantity" AS "currentStock",
        COALESCE(i."reorderQuantity", p."reorderLevel", 0)::float AS "reorderLevel"
      FROM "Inventory" i
      JOIN "Product" p ON p."id" = i."productId"
      JOIN "Warehouse" w ON w."id" = i."warehouseId"
      WHERE i."currentQuantity" <= COALESCE(i."reorderQuantity", p."reorderLevel", 0)
      ORDER BY i."currentQuantity" ASC
      LIMIT 100
    `;
        return rows.map((r) => ({
            ...r,
            currentStock: Number(r.currentStock),
            reorderLevel: Number(r.reorderLevel),
            deficit: Math.max(0, Number(r.reorderLevel) - Number(r.currentStock)),
        }));
    }
}
export const stockLevelService = new StockLevelService();
