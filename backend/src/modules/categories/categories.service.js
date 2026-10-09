import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
export class CategoryService {
    async list(params) {
        const where = { isActive: params.isActive ?? true };
        if (params.search)
            where.OR = [{ name: { contains: params.search } }];
        const [items, total] = await Promise.all([
            prisma.category.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy: { name: 'asc' } }),
            prisma.category.count({ where }),
        ]);
        return { items, total, page: params.page, limit: params.limit };
    }
    async get(id) {
        const c = await prisma.category.findUnique({ where: { id } });
        if (!c)
            throw ApiError.notFound('Category not found');
        return c;
    }
    async create(data, userId) {
        if (data.parentId) {
            const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
            if (!parent)
                throw ApiError.badRequest('Invalid parent category');
        }
        const created = await prisma.category.create({ data });
        await createAuditLog({ userId, action: 'CREATE', resourceType: 'category', resourceId: created.id });
        return created;
    }
    async update(id, data) {
        await this.get(id);
        if (data.parentId) {
            const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
            if (!parent)
                throw ApiError.badRequest('Invalid parent category');
        }
        return prisma.category.update({ where: { id }, data });
    }
    async delete(id, userId) {
        await this.get(id);
        await createAuditLog({ userId, action: 'DELETE', resourceType: 'category', resourceId: id });
        await prisma.category.delete({ where: { id } });
        return { success: true, message: 'Category deleted' };
    }
}
export const categoryService = new CategoryService();
