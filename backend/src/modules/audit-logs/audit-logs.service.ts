import { prisma } from '../../shared/config/database';
import { Prisma, AuditAction } from '@prisma/client';

export class AuditLogService {
  async list(params: { page: number; limit: number; userId?: string; resourceType?: string; action?: string; startDate?: Date; endDate?: Date }) {
    const { page, limit, userId, resourceType, action, startDate, endDate } = params;
    const where: Prisma.AuditLogWhereInput = {};
    if (userId) where.userId = userId;
    if (resourceType) where.resourceType = resourceType;
    if (action) where.action = action as AuditAction;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, username: true, fullName: true, role: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}

export const auditLogService = new AuditLogService();
