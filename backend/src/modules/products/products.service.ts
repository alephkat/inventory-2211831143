import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';
import { Prisma } from '@prisma/client';

export class ProductService {
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    supplierId?: string;
    warehouseId?: string;
    status?: string;
    lowStock?: boolean;
  }) {
    const { page, limit, search, categoryId, supplierId, warehouseId, status, lowStock } = params;
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status as any;

    let items = await prisma.product.findMany({
      where,
      include: {
        category: true,
        supplier: true,
        warehouse: true,
        inventories: warehouseId
          ? { where: { warehouseId }, take: 1 }
          : { take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lowStock) {
      items = items.filter((p) => {
        const inv = p.inventories[0];
        const current = inv?.currentQuantity ?? 0;
        return current <= (p.reorderLevel > 0 ? p.reorderLevel : p.minStockLevel);
      });
    }

    const total = lowStock ? items.length : await prisma.product.count({ where });
    const start = (page - 1) * limit;
    const mapped = items.slice(start, start + limit).map((p) => this.enrich(p));
    return { items: mapped, total, page, limit };
  }

  async get(id: string) {
    const p = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        warehouse: true,
        inventories: { include: { warehouse: true } },
      },
    });
    if (!p) throw ApiError.notFound('Product not found');
    return this.enrich(p);
  }

  async create(data: any, userId: string) {
    // validate fk refs
    await this.validateRelations(data);
    const created = await prisma.product.create({
      data: {
        ...data,
        createdBy: userId,
      },
    });
    // ensure an inventory row exists for the product's warehouse
    if (data.warehouseId) {
      await prisma.inventory.upsert({
        where: { productId_warehouseId: { productId: created.id, warehouseId: data.warehouseId } },
        update: {},
        create: {
          productId: created.id,
          warehouseId: data.warehouseId,
          minQuantity: data.minStockLevel ?? 0,
          reorderQuantity: data.reorderLevel ?? 0,
          stockValue: 0,
        },
      });
    }
    await createAuditLog({ userId, action: 'CREATE', resourceType: 'product', resourceId: created.id });
    return this.get(created.id);
  }

  async update(id: string, data: any, userId: string) {
    await this.get(id);
    await this.validateRelations(data);
    await prisma.product.update({ where: { id }, data: { ...data, updatedBy: userId } });
    await createAuditLog({ userId, action: 'UPDATE', resourceType: 'product', resourceId: id });
    return this.get(id);
  }

  async delete(id: string, userId: string) {
    await this.get(id);
    await createAuditLog({ userId, action: 'DELETE', resourceType: 'product', resourceId: id });
    await prisma.product.delete({ where: { id } });
    return { success: true, message: 'Product deleted' };
  }

  private async validateRelations(data: any) {
    if (data.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!c) throw ApiError.badRequest('Invalid category');
    }
    if (data.supplierId) {
      const s = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
      if (!s) throw ApiError.badRequest('Invalid supplier');
    }
    if (data.warehouseId) {
      const w = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
      if (!w) throw ApiError.badRequest('Invalid warehouse');
    }
  }

  private enrich(p: any) {
    const inv = p.inventories?.[0];
    const currentStock = inv?.currentQuantity ?? 0;
    const availableStock = inv?.availableQuantity ?? 0;
    const reservedStock = inv?.reservedQuantity ?? 0;
    // Cost price is authoritative when known; fall back to the stored ledger
    // value only when the product has no cost recorded. Parenthesised so the
    // `||` fallback is not swallowed by `??` precedence rules.
    const stockValue = currentStock * (p.costPrice ?? 0) || (inv?.stockValue ?? 0);
    return {
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      category: p.category,
      brand: p.brand,
      unit: p.unit,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      minStockLevel: p.minStockLevel,
      maxStockLevel: p.maxStockLevel,
      reorderLevel: p.reorderLevel,
      supplierId: p.supplierId,
      supplier: p.supplier,
      warehouseId: p.warehouseId,
      warehouse: p.warehouse,
      batchNumber: p.batchNumber,
      serialNumber: p.serialNumber,
      manufacturingDate: p.manufacturingDate,
      expiryDate: p.expiryDate,
      imageUrl: p.imageUrl,
      status: p.status,
      isActive: p.isActive,
      createdBy: p.createdBy,
      updatedBy: p.updatedBy,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      currentStock,
      availableStock,
      reservedStock,
      stockValue,
    };
  }
}

export const productService = new ProductService();
