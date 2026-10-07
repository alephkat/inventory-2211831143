import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';

/**
 * See `CategoryUpdateInput`: the API only sends plain scalars, but Prisma's
 * update input also permits `{ set: ... }` operation objects that are not
 * usable in a `where` clause.
 */

export class WarehouseService {
 async list(params) {
 const where.WarehouseWhereInput = { isActive: params.isActive ?? true };
 if (params.search) where.OR = [{ name}, { code}];
 const [items, total] = await Promise.all([
 prisma.warehouse.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy}),
 prisma.warehouse.count({ where }),
 ]);
 return { items, total, page: params.page, limit: params.limit };
 }
 async get(id) {
 const w = await prisma.warehouse.findUnique({ where});
 if (!w) throw ApiError.notFound('Warehouse not found');
 return w;
 }
 async create(data.WarehouseUncheckedCreateInput, userId) {
 if (data.code) {
 const dup = await prisma.warehouse.findUnique({ where});
 if (dup) throw ApiError.conflict('Warehouse code already exists');
 }
 const created = await prisma.warehouse.create({ data });
 await createAuditLog({ userId, action: 'CREATE', resourceType: 'warehouse', resourceId: created.id });
 return created;
 }
 async update(id, data) {
 await this.get(id);
 if (data.code) {
 const dup = await prisma.warehouse.findFirst({ where} });
 if (dup) throw ApiError.conflict('Warehouse code already exists');
 }
 return prisma.warehouse.update({ where, data });
 }
 async delete(id, userId) {
 await this.get(id);
 await createAuditLog({ userId, action: 'DELETE', resourceType: 'warehouse', resourceId: id });
 await prisma.warehouse.delete({ where});
 return { success: true, message: 'Warehouse deleted' };
 }
}
export const warehouseService = new WarehouseService();
