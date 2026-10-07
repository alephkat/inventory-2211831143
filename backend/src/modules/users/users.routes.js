import { Router } from 'express';
import { userService } from './users.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { getPagination } from '../../shared/utils/response.js';
import { z } from 'zod';

const UpdateUserSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  roleId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL']).optional(),
  isActive: z.boolean().optional(),
});

export const usersRouter = Router();

usersRouter.use(requirePermission('manage_users'));

function send(res, data, code = 200, message) {
  res.status(code).json({ success: true, data, message: message ?? null, meta: null });
}

usersRouter.get('/', async (req, res, next) => {
  try {
    const pg = getPagination(req.query);
    const result = await userService.list({
      ...pg,
      search: req.query.search,
      roleId: req.query.roleId,
      status: req.query.status,
      warehouseId: req.query.warehouseId,
    });
    res.json({ success: true, data: result, message: null, meta: null });
  } catch (e) {
    next(e);
  }
});

usersRouter.get('/:id', async (req, res, next) => {
  try {
    send(res, await userService.get(req.params.id));
  } catch (e) {
    next(e);
  }
});

usersRouter.put('/:id', validate(UpdateUserSchema), async (req, res, next) => {
  try {
    send(res, await userService.update(req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    send(res, await userService.delete(req.params.id, req.user.id), 200, 'User deleted');
  } catch (e) {
    next(e);
  }
});