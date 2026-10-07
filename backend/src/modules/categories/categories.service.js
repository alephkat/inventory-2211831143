import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';

/**
 * The route validates the body with Zod and only ever sends plain scalars.
 * Prisma's `UncheckedUpdateInput` additionally accepts `{ set: ... }` operation
 * objects, which cannot be used in a `where` clause, so the accepted shape is
 * spelled out rather than inferred.
 */

export class CategoryService {
 async list(params) {
 const where.CategoryWhereInput = { isActive: params.isActive ?? true };
 if (params.search) where.OR = [{ name}];
 const [items, total] = await Promise.all([
 prisma.category.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy}),
 prisma.category.count({ where }),
 ]);
 return { items, total, page: params.page, limit: params.limit };
 }

 async get(id) {
 const c = await prisma.category.findUnique({ where});
 if (!c) throw ApiError.notFound('Category not found');
 return c;
 }

 async create(data.CategoryUncheckedCreateInput, userId) {
 if (data.parentId) {
 const parent = await prisma.category.findUnique({ where});
 if (!parent) throw ApiError.badRequest('Invalid parent category');
 }
 const created = await prisma.category.create({ data });
 await createAuditLog({ userId, action: 'CREATE', resourceType: 'category', resourceId: created.id });
 return created;
 }

 async update(id, data) {
 await this.get(id);
 if (data.parentId) {
 const parent = await prisma.category.findUnique({ where});
 if (!parent) throw ApiError.badRequest('Invalid parent category');
 }
 return prisma.category.update({ where, data });
 }

 async delete(id, userId) {
 await this.get(id);
 await createAuditLog({ userId, action: 'DELETE', resourceType: 'category', resourceId: id });
 await prisma.category.delete({ where});
 return { success: true, message: 'Category deleted' };
 }
}

export const categoryService = new CategoryService();
