import { UserStatus } from '@prisma/client';
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
 roleId: true,
 status: true,
 isActive: true,
 profileImage: true,
 warehouseId: true,
 lastLogin: true,
 createdBy: true,
 createdAt: true,
 updatedAt: true,
} as const;

export class UserService {
 async list(params) {
 const { page, limit, search, roleId, status, warehouseId } = params;
 const where = {};
 if (search) {
 where.OR = [{ username}, { email}, { fullName}];
 }
 if (roleId) where.roleId = roleId;
 if (status) where.status = status;
 if (warehouseId) where.warehouseId = warehouseId;
 const [items, total] = await Promise.all([
 prisma.user.findMany({
 where,
 select} },
 skip: (page - 1) * limit,
 take: limit,
 orderBy,
 }),
 prisma.user.count({ where }),
 ]);
 return { items, total, page, limit };
 }

 async get(id) {
 const user = await prisma.user.findUnique({
 where,
 select} } },
 },
 },
 },
 });
 if (!user) throw ApiError.notFound('User not found');
 return user;
 }

 async update(id, data) {
 const existing = await prisma.user.findUnique({ where});
 if (!existing) throw ApiError.notFound('User not found');
 if (data.email && data.email !== existing.email) {
 const dup = await prisma.user.findFirst({ where});
 if (dup) throw ApiError.conflict('Email already in use');
 }
 // Status drives account lockout, so an unrecognised value is rejected
 // outright rather than coerced into the column.
 let status | undefined;
 if (data.status !== undefined) {
 if (!USER_STATUSES.includes(data.status )) {
 throw ApiError.badRequest(`status must be one of: ${USER_STATUSES.join(', ')}`);
 }
 status = data.status ;
 }
 if (data.roleId !== undefined) {
 const role = await prisma.role.findUnique({ where});
 if (!role) throw ApiError.badRequest('Invalid role');
 }
 let isActive = data.isActive;
 if (data.status !== undefined && data.isActive === undefined) {
 isActive = status === 'ACTIVE';
 }
 await prisma.user.update({
 where,
 data,
 });
 return this.get(id);
 }

 async delete(id, actorId) {
 const user = await prisma.user.findUnique({ where});
 if (!user) throw ApiError.notFound('User not found');
 if (user.id === actorId) throw ApiError.badRequest('Cannot delete your own account');
 await prisma.userSession.deleteMany({ where});
 await prisma.user.delete({ where});
 return { success: true, message: 'User deleted' };
 }
}

export const userService = new UserService();
