import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';

/**
 * See `CategoryUpdateInput`: the API only sends plain scalars, but Prisma's
 * update input also permits `{ set: ... }` operation objects that are not
 * usable in a `where` clause.
 */
export interface CustomerUpdateInput {
  name?: string;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export class CustomerService {
  async list(params: { page: number; limit: number; search?: string; isActive?: boolean }) {
    const where: Prisma.CustomerWhereInput = { isActive: params.isActive ?? true };
    if (params.search) where.OR = [{ name: { contains: params.search } }, { code: { contains: params.search } }];
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy: { name: 'asc' } }),
      prisma.customer.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  }
  async get(id: string) {
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw ApiError.notFound('Customer not found');
    return c;
  }
  async create(data: Prisma.CustomerUncheckedCreateInput, userId: string) {
    if (data.code) {
      const dup = await prisma.customer.findUnique({ where: { code: data.code } });
      if (dup) throw ApiError.conflict('Customer code already exists');
    }
    const created = await prisma.customer.create({ data });
    await createAuditLog({ userId, action: 'CREATE', resourceType: 'customer', resourceId: created.id });
    return created;
  }
  async update(id: string, data: CustomerUpdateInput) {
    await this.get(id);
    if (data.code) {
      const dup = await prisma.customer.findFirst({ where: { code: data.code, id: { not: id } } });
      if (dup) throw ApiError.conflict('Customer code already exists');
    }
    return prisma.customer.update({ where: { id }, data });
  }
  async delete(id: string, userId: string) {
    await this.get(id);
    await createAuditLog({ userId, action: 'DELETE', resourceType: 'customer', resourceId: id });
    await prisma.customer.delete({ where: { id } });
    return { success: true, message: 'Customer deleted' };
  }
}
export const customerService = new CustomerService();
