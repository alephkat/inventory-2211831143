import { prisma } from '../../shared/config/database';
import { bucketMovementsByLocalDay, localDayWindow } from '../../shared/utils/dates';
import { Prisma, TransactionStatus, TransactionType, TransferStatus } from '@prisma/client';

export class DashboardService {
  async stats(warehouseId?: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalProducts,
      totalStock,
      lowStockItems,
      outOfStockItems,
      expiringItems,
      pendingPO,
      pendingTx,
      pendingTransfers,
      pendingAdjustments,
      receivedToday,
      issuedToday,
    ] = await Promise.all([
      prisma.product.count({
        where: warehouseId ? { isActive: true, warehouseId } : { isActive: true },
      }),
      prisma.inventory.aggregate({
        _sum: { currentQuantity: true, stockValue: true },
        where: warehouseId ? { warehouseId } : {},
      }),
      this.countLowStock(warehouseId),
      this.countOutOfStock(warehouseId),
      prisma.product.count({
        where: { expiryDate: { not: null, lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.purchaseOrder.count({ where: { status: 'PENDING' } }),
      prisma.inventoryTransaction.count({ where: { status: 'PENDING' } }),
      prisma.stockTransfer.count({ where: { status: TransferStatus.REQUESTED } }),
      prisma.stockAdjustment.count({ where: { status: 'PENDING' } }),
      prisma.inventoryTransaction.aggregate({
        _sum: { quantity: true },
        where: { type: TransactionType.RECEIVED, status: 'COMPLETED', createdAt: { gte: todayStart } },
      }),
      prisma.inventoryTransaction.aggregate({
        _sum: { quantity: true },
        where: { type: TransactionType.ISSUED, status: 'COMPLETED', createdAt: { gte: todayStart } },
      }),
    ]);

    const recentTransactions = await prisma.inventoryTransaction.findMany({
      where: { status: 'COMPLETED' },
      include: { product: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const lowStockAlerts = await this.lowStockList(warehouseId);

    const expiringProducts = await prisma.product.findMany({
      where: {
        expiryDate: { not: null, lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { warehouse: true },
      orderBy: { expiryDate: 'asc' },
      take: 20,
    });

    return {
      totalProducts,
      totalStockQuantity: Number(totalStock._sum.currentQuantity ?? 0),
      totalStockValue: Number(totalStock._sum.stockValue ?? 0),
      lowStockItems,
      outOfStockItems,
      expiringItems,
      pendingPurchaseOrders: pendingPO,
      pendingApprovals: pendingTx + pendingTransfers + pendingAdjustments + pendingPO,
      stockReceivedToday: Number(receivedToday._sum?.quantity ?? 0),
      stockIssuedToday: Number(issuedToday._sum?.quantity ?? 0),
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        productName: t.product?.name,
        warehouseName: t.warehouse?.name,
        quantity: t.quantity,
        status: t.status,
        createdAt: t.createdAt,
        performedBy: t.performedById,
      })),
      lowStockAlerts,
      expiringProducts: expiringProducts.map((p) => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        expiryDate: p.expiryDate,
        daysUntilExpiry: Math.ceil((p.expiryDate!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        currentStock: 0,
        warehouseName: p.warehouse?.name ?? '',
      })),
    };
  }

  async stockMovementChart(days: number = 7, warehouseId?: string) {
    // Bucketing happens in JS so the buckets and the labels share one timezone.
    // Aggregating with `date_trunc` in Postgres would group by the *database
    // session* timezone instead, which drifts out of step with the labels.
    const { from, until } = localDayWindow(days);
    const rows = await prisma.inventoryTransaction.findMany({
      where: {
        createdAt: { gte: from, lt: until },
        status: TransactionStatus.COMPLETED,
        type: { in: [TransactionType.RECEIVED, TransactionType.ISSUED] },
        ...(warehouseId ? { warehouseId } : {}),
      },
      select: { type: true, quantity: true, createdAt: true },
    });

    const { labels, series } = bucketMovementsByLocalDay(
      rows.map((row) => ({ series: row.type, quantity: row.quantity, createdAt: row.createdAt })),
      [TransactionType.RECEIVED, TransactionType.ISSUED],
      days,
    );

    return { received: series.RECEIVED, issued: series.ISSUED, labels };
  }

  async inventoryValueChart(warehouseId?: string) {
    const rows = await prisma.$queryRaw<
      Array<{ label: string; value: number }>
    >`
      SELECT COALESCE(c."name", p."name") AS label, SUM(i."stockValue")::float AS value
      FROM "Inventory" i
      JOIN "Product" p ON p."id" = i."productId"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      ${warehouseId ? Prisma.sql`WHERE i."warehouseId" = ${warehouseId}` : Prisma.empty}
      GROUP BY label
      ORDER BY value DESC
      LIMIT 10
    `;
    return { data: rows, labels: rows.map((r) => r.label) };
  }

  private async countLowStock(warehouseId?: string) {
    const wh = warehouseId ? Prisma.sql`AND i."warehouseId" = ${warehouseId}` : Prisma.empty;
    const res = await prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT COUNT(*)::int AS count FROM "Inventory" i JOIN "Product" p ON p."id" = i."productId" WHERE i."currentQuantity" <= COALESCE(i."reorderQuantity", p."reorderLevel", 0) ${wh} AND p."isActive" = true`;
    return Number(res[0]?.count ?? 0);
  }

  private async countOutOfStock(warehouseId?: string) {
    const wh = warehouseId ? Prisma.sql`AND i."warehouseId" = ${warehouseId}` : Prisma.empty;
    const res = await prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT COUNT(*)::int AS count FROM "Inventory" i JOIN "Product" p ON p."id" = i."productId" WHERE i."currentQuantity" <= 0 ${wh} AND p."isActive" = true`;
    return Number(res[0]?.count ?? 0);
  }

  private async lowStockList(warehouseId?: string) {
    const rows = await prisma.$queryRaw<Array<{ productId: string; productName: string; sku: string; currentStock: number; reorderLevel: number; warehouseName: string }>>`
      SELECT i."productId", p."name" AS "productName", p."sku", i."currentQuantity"::float AS "currentStock",
             COALESCE(i."reorderQuantity", p."reorderLevel", 0)::float AS "reorderLevel", w."name" AS "warehouseName"
      FROM "Inventory" i
      JOIN "Product" p ON p."id" = i."productId"
      JOIN "Warehouse" w ON w."id" = i."warehouseId"
      WHERE p."isActive" = true
        AND i."currentQuantity" <= COALESCE(i."reorderQuantity", p."reorderLevel", 0)
        ${warehouseId ? Prisma.sql`AND i."warehouseId" = ${warehouseId}` : Prisma.empty}
      ORDER BY i."currentQuantity" ASC
      LIMIT 50
    `;
    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      currentStock: Number(row.currentStock),
      reorderLevel: Number(row.reorderLevel),
      warehouseName: row.warehouseName,
      deficit: Math.max(0, Number(row.reorderLevel) - Number(row.currentStock)),
    }));
  }
}

export const dashboardService = new DashboardService();
