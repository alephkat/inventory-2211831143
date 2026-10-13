import { randomBytes } from 'node:crypto';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
export class ProductService {
    async list(params) {
        const { page, limit, search, categoryId, supplierId, warehouseId, status, lowStock } = params;
        const skip = (page - 1) * limit;
        const where = { isActive: true };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { sku: { contains: search } },
                { barcode: { contains: search } },
            ];
        }
        if (categoryId)
            where.categoryId = categoryId;
        if (supplierId)
            where.supplierId = supplierId;
        if (status)
            where.status = status;

        let items;
        let total;
        if (lowStock) {
            const warehouseFilter = warehouseId ? `AND i."warehouseId" = '${warehouseId}'` : '';
            const searchFilter = search ? `
                AND (
                    p."name" ILIKE '%${search}%' 
                    OR p."sku" ILIKE '%${search}%' 
                    OR p."barcode" ILIKE '%${search}%'
                )` : '';
            const categoryFilter = categoryId ? `AND p."categoryId" = '${categoryId}'` : '';
            const supplierFilter = supplierId ? `AND p."supplierId" = '${supplierId}'` : '';
            const statusFilter = status ? `AND p."status" = '${status}'` : '';
            const countQuery = `
                SELECT COUNT(*)
                FROM "Product" p
                JOIN "Inventory" i ON i."productId" = p."id"
                WHERE p."isActive" = true
                AND i."currentQuantity" <= COALESCE(i."reorderQuantity", p."reorderLevel", 0)
                ${warehouseFilter}
                ${searchFilter}
                ${categoryFilter}
                ${supplierFilter}
                ${statusFilter}
            `;
            const [countResult] = await prisma.$queryRawUnsafe(countQuery);
            total = Number(countResult.count);
            const dataQuery = `
                SELECT
                    p.*, i."currentQuantity", i."availableQuantity", i."reservedQuantity", i."stockValue",
                    c."name" AS "categoryName", c."description" AS "categoryDescription",
                    s."name" AS "supplierName", s."contactPerson" AS "supplierContact", s."email" AS "supplierEmail", s."phone" AS "supplierPhone",
                    w."name" AS "warehouseName", w."code" AS "warehouseCode"
                FROM "Product" p
                JOIN "Inventory" i ON i."productId" = p."id"
                LEFT JOIN "Category" c ON c."id" = p."categoryId"
                LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
                LEFT JOIN "Warehouse" w ON w."id" = i."warehouseId"
                WHERE p."isActive" = true
                AND i."currentQuantity" <= COALESCE(i."reorderQuantity", p."reorderLevel", 0)
                ${warehouseFilter}
                ${searchFilter}
                ${categoryFilter}
                ${supplierFilter}
                ${statusFilter}
                ORDER BY p."createdAt" DESC
                LIMIT ${limit} OFFSET ${skip}
            `;
            const rows = await prisma.$queryRawUnsafe(dataQuery);
            items = rows.map((r) => this.enrichRaw(r));
        } else {
            const [data, count] = await Promise.all([
                prisma.product.findMany({
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
                    skip,
                    take: limit,
                }),
                prisma.product.count({ where }),
            ]);
            items = data.map((p) => this.enrich(p));
            total = count;
        }
        return { items, total, page, limit };
    }
    async get(id) {
        const p = await prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                supplier: true,
                warehouse: true,
                inventories: { include: { warehouse: true } },
            },
        });
        if (!p)
            throw ApiError.notFound('Product not found');
        return this.enrich(p);
    }
    async create(data, userId) {
        // validate fk refs
        await this.validateRelations(data);
        const created = await prisma.product.create({
            data: {
                ...data,
                sku: data.sku ?? (await this.generateSku()),
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
    /**
     * Generates a unique SKU (`PRD-XXXXXXXX`) for products created without
     * one. Retries on the (rare) collision so a duplicate insert never
     * surfaces as an opaque unique-constraint error.
     */
    async generateSku() {
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = `PRD-${randomBytes(4).toString('hex').toUpperCase()}`;
            const existing = await prisma.product.findUnique({ where: { sku: candidate }, select: { id: true } });
            if (!existing)
                return candidate;
        }
        throw ApiError.conflict('Could not generate a unique SKU, please try again');
    }
    async update(id, data, userId) {
        await this.get(id);
        await this.validateRelations(data);
        await prisma.product.update({ where: { id }, data: { ...data, updatedBy: userId } });
        await createAuditLog({ userId, action: 'UPDATE', resourceType: 'product', resourceId: id });
        return this.get(id);
    }
    async delete(id, userId) {
        await this.get(id);
        await createAuditLog({ userId, action: 'DELETE', resourceType: 'product', resourceId: id });
        await prisma.product.delete({ where: { id } });
        return { success: true, message: 'Product deleted' };
    }
    async validateRelations(data) {
        if (data.categoryId) {
            const c = await prisma.category.findUnique({ where: { id: data.categoryId } });
            if (!c)
                throw ApiError.badRequest('Invalid category');
        }
        if (data.supplierId) {
            const s = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
            if (!s)
                throw ApiError.badRequest('Invalid supplier');
        }
        if (data.warehouseId) {
            const w = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
            if (!w)
                throw ApiError.badRequest('Invalid warehouse');
        }
    }
    enrich(p) {
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
    enrichRaw(r) {
        const currentStock = Number(r.currentQuantity ?? 0);
        const availableStock = Number(r.availableQuantity ?? 0);
        const reservedStock = Number(r.reservedQuantity ?? 0);
        const stockValue = currentStock * (r.costPrice ?? 0) || Number(r.stockValue ?? 0);
        return {
            id: r.id,
            sku: r.sku,
            barcode: r.barcode,
            name: r.name,
            description: r.description,
            categoryId: r.categoryId,
            category: r.categoryName ? { id: r.categoryId, name: r.categoryName, description: r.categoryDescription } : null,
            brand: r.brand,
            unit: r.unit,
            costPrice: r.costPrice,
            sellingPrice: r.sellingPrice,
            minStockLevel: r.minStockLevel,
            maxStockLevel: r.maxStockLevel,
            reorderLevel: r.reorderLevel,
            supplierId: r.supplierId,
            supplier: r.supplierName ? { id: r.supplierId, name: r.supplierName, contactPerson: r.supplierContact, email: r.supplierEmail, phone: r.supplierPhone } : null,
            warehouseId: r.warehouseId,
            warehouse: r.warehouseName ? { id: r.warehouseId, name: r.warehouseName, code: r.warehouseCode } : null,
            batchNumber: r.batchNumber,
            serialNumber: r.serialNumber,
            manufacturingDate: r.manufacturingDate,
            expiryDate: r.expiryDate,
            status: r.status,
            isActive: r.isActive,
            createdBy: r.createdBy,
            updatedBy: r.updatedBy,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            currentStock,
            availableStock,
            reservedStock,
            stockValue,
        };
    }
}
export const productService = new ProductService();
