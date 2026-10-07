import { prisma } from '../../shared/config/database.js';
import { Prisma, AuditAction } from '@prisma/client';

export class AuditLogService {
 async list(params) {
 const { page, limit, userId, resourceType, action, startDate, endDate } = params;
 const where.AuditLogWhereInput = {};
 if (userId) where.userId = userId;
 if (resourceType) where.resourceType = resourceType;
 if (action) where.action = action ;
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
 include} } } },
 orderBy,
 }),
 prisma.auditLog.count({ where }),
 ]);
 return { items, total, page, limit };
 }
}

export const auditLogService = new AuditLogService();
