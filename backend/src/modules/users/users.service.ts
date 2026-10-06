import { UserStatus } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';

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
  async list(params: { page: number; limit: number; search?: string; roleId?: string; status?: string; warehouseId?: string }) {
    const { page, limit, search, roleId, status, warehouseId } = params;
    const where: any = {};
    if (search) {
      where.OR = [{ username: { contains: search } }, { email: { contains: search } }, { fullName: { contains: search } }];
    }
    if (roleId) where.roleId = roleId;
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { ...USER_PUBLIC_SELECT, role: { select: { id: true, name: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_PUBLIC_SELECT,
        role: {
          select: {
            id: true,
            name: true,
            permissions: { select: { permission: { select: { value: true, name: true } } } },
          },
        },
      },
    });
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  async update(id: string, data: { fullName?: string; email?: string; roleId?: string; warehouseId?: string | null; status?: string; isActive?: boolean }) {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('User not found');
    if (data.email && data.email !== existing.email) {
      const dup = await prisma.user.findFirst({ where: { email: data.email } });
      if (dup) throw ApiError.conflict('Email already in use');
    }
    // Status drives account lockout, so an unrecognised value is rejected
    // outright rather than coerced into the column.
    let status: UserStatus | undefined;
    if (data.status !== undefined) {
      if (!USER_STATUSES.includes(data.status as UserStatus)) {
        throw ApiError.badRequest(`status must be one of: ${USER_STATUSES.join(', ')}`);
      }
      status = data.status as UserStatus;
    }
    await prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName ?? undefined,
        email: data.email ?? undefined,
        roleId: data.roleId ?? undefined,
        warehouseId: data.warehouseId === undefined ? undefined : data.warehouseId,
        status: status ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    });
    return this.get(id);
  }

  async delete(id: string, actorId: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw ApiError.notFound('User not found');
    if (user.id === actorId) throw ApiError.badRequest('Cannot delete your own account');
    await prisma.userSession.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    return { success: true, message: 'User deleted' };
  }
}

export const userService = new UserService();
