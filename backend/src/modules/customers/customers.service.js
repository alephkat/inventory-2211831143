import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';

/**
 * See `CategoryUpdateInput`: the API only sends plain scalars, but Prisma's
 * update input also permits `{ set: ... }` operation objects that are not
 * usable in a `where` clause.
 */

export class CustomerService {
 async list(params) {
 const where.CustomerWhereInput = { isActive: params.isActive ?? true };
 if (params.search) where.OR = [{ name}, { code}];
 const [items, total] = await Promise.all([
 prisma.customer.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy}),
 prisma.customer.count({ where }),
 ]);
 return { items, total, page: params.page, limit: params.limit };
 }
 async get(id) {
 const c = await prisma.customer.findUnique({ where});
 if (!c) throw ApiError.notFound('Customer not found');
 return c;
 }
 async create(data.CustomerUncheckedCreateInput, userId) {
 if (data.code) {
 const dup = await prisma.customer.findUnique({ where});
 if (dup) throw ApiError.conflict('Customer code already exists');
 }
 const created = await prisma.customer.create({ data });
 await createAuditLog({ userId, action: 'CREATE', resourceType: 'customer', resourceId: created.id });
 return created;
 }
 async update(id, data) {
 await this.get(id);
 if (data.code) {
 const dup = await prisma.customer.findFirst({ where} });
 if (dup) throw ApiError.conflict('Customer code already exists');
 }
 return prisma.customer.update({ where, data });
 }
 async delete(id, userId) {
 await this.get(id);
 await createAuditLog({ userId, action: 'DELETE', resourceType: 'customer', resourceId: id });
 await prisma.customer.delete({ where});
 return { success: true, message: 'Customer deleted' };
 }
}
export const customerService = new CustomerService();
