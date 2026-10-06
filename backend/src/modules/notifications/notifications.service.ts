import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';

/**
 * Notification delivery and the in-app inbox.
 *
 * Workflow services raise notifications through `dispatch`; this service owns
 * delivery and the read state. Delivery is best-effort by design — see
 * `shared/workflow/runtime.ts`, which swallows notification failures so a
 * broken inbox can never roll back a stock movement that already committed.
 */

export interface DispatchInput {
  title: string;
  body: string;
  type: NotificationType;
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
}

export class NotificationService {
  async list(
    userId: string,
    params: { page: number; limit: number; isRead?: string; type?: string; priority?: string },
  ) {
    const { page, limit, isRead, type, priority } = params;
    const where: Prisma.NotificationWhereInput = { userId };

    if (isRead === 'true') where.isRead = true;
    if (isRead === 'false') where.isRead = false;
    if (type) where.type = type as NotificationType;
    if (priority) where.priority = priority as NotificationPriority;

    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { items, total, page, limit, unread };
  }

  async markRead(id: string, userId: string) {
    // Scoped by userId so one user cannot mark another's notification read.
    const existing = await prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw ApiError.notFound('Notification not found');
    if (existing.isRead) return existing;

    return prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const { count } = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: count };
  }

  async unreadCount(userId: string) {
    const unread = await prisma.notification.count({ where: { userId, isRead: false } });
    return { unread };
  }

  async remove(id: string, userId: string) {
    const existing = await prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw ApiError.notFound('Notification not found');
    await prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  /** Raise a notification for one recipient. Used by the workflow runtime. */
  async dispatch(userId: string, input: DispatchInput) {
    return prisma.notification.create({
      data: {
        userId,
        title: input.title,
        body: input.body,
        type: input.type,
        priority: input.priority ?? NotificationPriority.MEDIUM,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Fan a notification out to every user holding one of the given permissions.
   * This is how approval queues are addressed: "tell everyone who can approve
   * stock receipts" rather than hard-coding a role name.
   */
  async dispatchToPermissions(
    permissions: readonly string[],
    input: DispatchInput,
  ): Promise<number> {
    if (permissions.length === 0) return 0;

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
        role: { permissions: { some: { permission: { value: { in: [...permissions] } } } } },
      },
      select: { id: true },
    });

    if (users.length === 0) return 0;

    const result = await prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: input.title,
        body: input.body,
        type: input.type,
        priority: input.priority ?? NotificationPriority.MEDIUM,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
    return result.count;
  }
}

export const notificationService = new NotificationService();
