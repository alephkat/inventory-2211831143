import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
export class CustomerService {
    async list(params) {
        const where = { isActive: params.isActive ?? true };
        if (params.search)
            where.OR = [{ name: { contains: params.search } }, { code: { contains: params.search } }];
        const [items, total] = await Promise.all([
            prisma.customer.findMany({ where, skip: (params.page - 1) * params.limit, take: params.limit, orderBy: { name: 'asc' } }),
            prisma.customer.count({ where }),
        ]);
        return { items, total, page: params.page, limit: params.limit };
    }
    async get(id) {
        const c = await prisma.customer.findUnique({ where: { id } });
        if (!c)
            throw ApiError.notFound('Customer not found');
        return c;
    }
    async create(data, userId) {
        if (data.code) {
            const dup = await prisma.customer.findUnique({ where: { code: data.code } });
            if (dup)
                throw ApiError.conflict('Customer code already exists');
        }
        const created = await prisma.customer.create({ data });
        await createAuditLog({ userId, action: 'CREATE', resourceType: 'customer', resourceId: created.id });
        return created;
    }
    async update(id, data) {
        await this.get(id);
        if (data.code) {
            const dup = await prisma.customer.findFirst({ where: { code: data.code, id: { not: id } } });
            if (dup)
                throw ApiError.conflict('Customer code already exists');
        }
        return prisma.customer.update({ where: { id }, data });
    }
    async delete(id, userId) {
        await this.get(id);
        await createAuditLog({ userId, action: 'DELETE', resourceType: 'customer', resourceId: id });
        await prisma.customer.delete({ where: { id } });
        return { success: true, message: 'Customer deleted' };
    }
}
export const customerService = new CustomerService();
