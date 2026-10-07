import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';

/**
 * Notification delivery and the in-app inbox.
 *
 * Workflow services raise notifications through `dispatch`; this service owns
 * delivery and the read state. Delivery is best-effort by design — see
 * `shared/workflow/runtime.ts`, which swallows notification failures so a
 * broken inbox can never roll back a stock movement that already committed.
 */

export class NotificationService {
 async list(
 userId,
 params) {
 const { page, limit, isRead, type, priority } = params;
 const where.NotificationWhereInput = { userId };

 if (isRead === 'true') where.isRead = true;
 if (isRead === 'false') where.isRead = false;
 if (type) where.type = type ;
 if (priority) where.priority = priority ;

 const [items, total, unread] = await Promise.all([
 prisma.notification.findMany({
 where,
 skip: (page - 1) * limit,
 take: limit,
 orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
 }),
 prisma.notification.count({ where }),
 prisma.notification.count({ where}),
 ]);

 return { items, total, page, limit, unread };
 }

 async markRead(id, userId) {
 // Scoped by userId so one user cannot mark another's notification read.
 const existing = await prisma.notification.findFirst({ where});
 if (!existing) throw ApiError.notFound('Notification not found');
 if (existing.isRead) return existing;

 return prisma.notification.update({
 where,
 data,
 });
 }

 async markAllRead(userId) {
 const { count } = await prisma.notification.updateMany({
 where,
 data,
 });
 return { updated: count };
 }

 async unreadCount(userId) {
 const unread = await prisma.notification.count({ where});
 return { unread };
 }

 async remove(id, userId) {
 const existing = await prisma.notification.findFirst({ where});
 if (!existing) throw ApiError.notFound('Notification not found');
 await prisma.notification.delete({ where});
 return { success: true };
 }

 /** Raise a notification for one recipient. Used by the workflow runtime. */
 async dispatch(userId, input) {
 return prisma.notification.create({
 data,
 });
 }

 /**
 * Fan a notification out to every user holding one of the given permissions.
 * This is how approval queues are addressed: "tell everyone who can approve
 * stock receipts" rather than hard-coding a role name.
 */
 async dispatchToPermissions(
 permissions[],
 input) {
 if (permissions.length === 0) return 0;

 const users = await prisma.user.findMany({
 where} } } },
 },
 select,
 });

 if (users.length === 0) return 0;

 const result = await prisma.notification.createMany({
 data: users.map((user) => ({
 userId: user.id,
 title: input.title,
 body: input.body,
 type: input.type,
 priority: input.priority ?? NotificationPriority.MEDIUM,
 data: (input.data ?? undefined) .InputJsonValue | undefined,
 })),
 });
 return result.count;
 }
}

export const notificationService = new NotificationService();
