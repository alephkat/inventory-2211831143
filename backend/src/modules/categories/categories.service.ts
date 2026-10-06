import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import { createAuditLog } from '../../shared/utils/audit';

/**
 * The route validates the body with Zod and only ever sends plain scalars.
 * Prisma's `UncheckedUpdateInput` additionally accepts `{ set: ... }` operation
 * objects, which cannot be used in a `where` clause, so the accepted shape is
 * spelled out rather than inferred.
 */
export interface CategoryUpdateInput {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

export class CategoryService {
  async list(params: { page: number; limit: number; search?: string; isActive?: boolean }) {
    const where: Prisma.CategoryWhereInput = { isActive: params.isActive ?? true };
    if (params.search) where.OR = [{ name: { contains: params.search } }];
    const [items, total] = await Promise.all([
      prisma.category.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy: { name: 'asc' } }),
      prisma.category.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  }

  async get(id: string) {
    const c = await prisma.category.findUnique({ where: { id } });
    if (!c) throw ApiError.notFound('Category not found');
    return c;
  }

  async create(data: Prisma.CategoryUncheckedCreateInput, userId: string) {
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw ApiError.badRequest('Invalid parent category');
    }
    const created = await prisma.category.create({ data });
    await createAuditLog({ userId, action: 'CREATE', resourceType: 'category', resourceId: created.id });
    return created;
  }

  async update(id: string, data: CategoryUpdateInput) {
    await this.get(id);
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw ApiError.badRequest('Invalid parent category');
    }
    return prisma.category.update({ where: { id }, data });
  }

  async delete(id: string, userId: string) {
    await this.get(id);
    await createAuditLog({ userId, action: 'DELETE', resourceType: 'category', resourceId: id });
    await prisma.category.delete({ where: { id } });
    return { success: true, message: 'Category deleted' };
  }
}

export const categoryService = new CategoryService();
