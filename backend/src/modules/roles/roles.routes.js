import { Router } from 'express';
import { roleService } from './roles.service.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requirePermission } from '../../shared/middlewares/auth.js';
import { z } from 'zod';
const CreateRoleSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});
const AssignPermsSchema = z.object({
    permissionIds: z.array(z.string()).min(1),
    permissionValues: z.array(z.string()).min(1).optional(),
});
export const rolesRouter = Router();
rolesRouter.use(requirePermission('manage_users'));
rolesRouter.get('/', async (_req, res, next) => {
    try {
        const roles = await roleService.list();
        res.json({ success: true, data: roles, message: null, meta: null });
    }
    catch (e) {
        next(e);
    }
});
rolesRouter.get('/:id', async (req, res, next) => {
    try {
        const role = await roleService.get(req.params.id);
        res.json({ success: true, data: role, message: null, meta: null });
    }
    catch (e) {
        next(e);
    }
});
rolesRouter.post('/', validate(CreateRoleSchema), async (req, res, next) => {
    try {
        const role = await roleService.create(req.body, req.user.id);
        res.status(201).json({ success: true, data: role, message: 'Role created', meta: null });
    }
    catch (e) {
        next(e);
    }
});
rolesRouter.post('/:id/permissions', validate(AssignPermsSchema), async (req, res, next) => {
    try {
        // Older clients send `permissionIds`; the service works in permission
        // values so that a typo can be reported instead of silently ignored.
        const values = req.body.permissionValues ?? req.body.permissionIds;
        const role = await roleService.assignPermissions(req.params.id, values, req.user.id);
        res.json({ success: true, data: role, message: 'Permissions assigned', meta: null });
    }
    catch (e) {
        next(e);
    }
});
