import { UserStatus } from '@prisma/client';
import { ROLE_VALUES } from '../../shared/types/permissions.js';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
const USER_STATUSES = Object.values(UserStatus);
/**
 * Projection for every user returned to a client. `passwordHash` is excluded
 * at the query level rather than stripped afterwards: selecting it would put
 * the hash in memory and would only be safe as long as every future response
 * path remembered to delete it.
 */
const USER_PUBLIC_SELECT = {
    id: true,
    username: true,
    email: true,
    fullName: true,
    role: true,
    status: true,
    isActive: true,
    profileImage: true,
    warehouseId: true,
    lastLogin: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
};
export class UserService {
    async list(params) {
        const { page, limit, search, role, status, warehouseId } = params;
        const where = {};
        if (search) {
            where.OR = [{ username: { contains: search } }, { email: { contains: search } }, { fullName: { contains: search } }];
        }
        if (role)
            where.role = role;
        if (status)
            where.status = status;
        if (warehouseId)
            where.warehouseId = warehouseId;
        const [items, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: USER_PUBLIC_SELECT,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);
        return { items, total, page, limit };
    }
    async get(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_PUBLIC_SELECT,
        });
        if (!user)
            throw ApiError.notFound('User not found');
        return user;
    }
    async update(id, data) {
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing)
            throw ApiError.notFound('User not found');
        if (data.email && data.email !== existing.email) {
            const dup = await prisma.user.findFirst({ where: { email: data.email } });
            if (dup)
                throw ApiError.conflict('Email already in use');
        }
        // Status drives account lockout, so an unrecognised value is rejected
        // outright rather than coerced into the column.
        let status;
        if (data.status !== undefined) {
            if (!USER_STATUSES.includes(data.status)) {
                throw ApiError.badRequest(`status must be one of: ${USER_STATUSES.join(', ')}`);
            }
            status = data.status;
        }
        if (data.role !== undefined && !ROLE_VALUES.includes(data.role)) {
            throw ApiError.badRequest(`role must be one of: ${ROLE_VALUES.join(', ')}`);
        }
        let isActive = data.isActive;
        if (data.status !== undefined && data.isActive === undefined) {
            isActive = status === 'ACTIVE';
        }
        await prisma.user.update({
            where: { id },
            data: {
                fullName: data.fullName ?? undefined,
                email: data.email ?? undefined,
                role: data.role ?? undefined,
                warehouseId: data.warehouseId === undefined ? undefined : data.warehouseId,
                status: status ?? undefined,
                isActive: isActive ?? undefined,
            },
        });
        return this.get(id);
    }
    async delete(id, actorId) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user)
            throw ApiError.notFound('User not found');
        if (user.id === actorId)
            throw ApiError.badRequest('Cannot delete your own account');
        await prisma.userSession.deleteMany({ where: { userId: id } });
        await prisma.user.delete({ where: { id } });
        return { success: true, message: 'User deleted' };
    }
}
export const userService = new UserService();
