import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middlewares/asyncHandler.js';
import { validate } from '../../shared/middlewares/validate.js';
import { getPagination, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import { notificationService } from './notifications.service.js';

const ListSchema = z.object({
 page: z.coerce.number().int().positive().optional(),
 limit: z.coerce.number().int().positive().max(100).optional(),
 isRead: z.enum(['true', 'false']).optional(),
 type: z.string().optional(),
 priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

export const notificationsRouter = Router();

// Notifications are personal: the router is reachable by any authenticated
// user and every query is scoped to req.user.id. There is deliberately no
// permission gate here — there is nothing to authorize beyond "your own".
notificationsRouter.get(
 '/',
 validate(ListSchema, 'query'),
 asyncHandler(async (req, res) => {
 const query = req.query as unknown as z.infer<typeof ListSchema>;
 const { page, limit } = getPagination(query);
 const result = await notificationService.list(req.user!.id, {
 page,
 limit,
 isRead: query.isRead,
 type: query.type,
 priority: query.priority,
 });

 res.json(
 sendPaginated(result.items, result.total, result.page, result.limit, {
 unread: result.unread,
 }));
 }));

notificationsRouter.get(
 '/unread-count',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await notificationService.unreadCount(req.user!.id)));
 }));

notificationsRouter.post(
 '/:id/read',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await notificationService.markRead(req.params.id, req.user!.id)));
 }));

notificationsRouter.post(
 '/read-all',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await notificationService.markAllRead(req.user!.id)));
 }));

notificationsRouter.delete(
 '/:id',
 asyncHandler(async (req, res) => {
 res.json(sendSuccess(await notificationService.remove(req.params.id, req.user!.id)));
 }));
