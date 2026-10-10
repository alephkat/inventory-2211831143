import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requireAuth, requirePermission } from '../../shared/middlewares/auth.js';
import { LoginSchema, RegisterSchema, RefreshSchema, ChangePasswordSchema, } from './auth.schema.js';
export const authRouter = Router();
/** Public routes */
authRouter.post('/login', validate(LoginSchema), authController.login);
authRouter.post('/refresh', validate(RefreshSchema), authController.refresh);
/** Protected routes - authentication required */
authRouter.post('/logout', requireAuth, validate(RefreshSchema), authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.post('/change-password', requireAuth, validate(ChangePasswordSchema), authController.changePassword);
/** Admin-only user creation. Single-company deployment: accounts are issued
  * by an administrator, there is no public self-registration. */
authRouter.post('/register/admin', requireAuth, requirePermission('manage_users'), validate(RegisterSchema), authController.register);
/** Discovery of available permissions (read-only; any authenticated user) */
authRouter.get('/permissions', requireAuth, authController.permissions);
