import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';

/**
 * See `CategoryUpdateInput`: the API only sends plain scalars, but Prisma's
 * update input also permits `{ set: ... }` operation objects that are not
 * usable in a `where` clause.
 */
export interface WarehouseUpdateInput {
  name?: string;
  code?: string | null;
  location?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export class WarehouseService {
  async list(params: { page: number; limit: number; search?: string; isActive?: boolean }) {
    const where: Prisma.WarehouseWhereInput = { isActive: params.isActive ?? true };
    if (params.search) where.OR = [{ name: { contains: params.search } }, { code: { contains: params.search } }];
    const [items, total] = await Promise.all([
      prisma.warehouse.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy: { name: 'asc' } }),
      prisma.warehouse.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  }
  async get(id: string) {
    const w = await prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw ApiError.notFound('Warehouse not found');
    return w;
  }
  async create(data: Prisma.WarehouseUncheckedCreateInput, userId: string) {
    if (data.code) {
      const dup = await prisma.warehouse.findUnique({ where: { code: data.code } });
      if (dup) throw ApiError.conflict('Warehouse code already exists');
    }
    const created = await prisma.warehouse.create({ data });
    await createAuditLog({ userId, action: 'CREATE', resourceType: 'warehouse', resourceId: created.id });
    return created;
  }
  async update(id: string, data: WarehouseUpdateInput) {
    await this.get(id);
    if (data.code) {
      const dup = await prisma.warehouse.findFirst({ where: { code: data.code, id: { not: id } } });
      if (dup) throw ApiError.conflict('Warehouse code already exists');
    }
    return prisma.warehouse.update({ where: { id }, data });
  }
  async delete(id: string, userId: string) {
    await this.get(id);
    await createAuditLog({ userId, action: 'DELETE', resourceType: 'warehouse', resourceId: id });
    await prisma.warehouse.delete({ where: { id } });
    return { success: true, message: 'Warehouse deleted' };
  }
}
export const warehouseService = new WarehouseService();
