import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../shared/middlewares/validate';
import { requireAuth, requirePermission } from '../../shared/middlewares/auth';
import {
  LoginSchema,
  RegisterSchema,
  PublicRegisterSchema,
  RefreshSchema,
  ChangePasswordSchema,
} from './auth.schema';

export const authRouter = Router();

/** Public routes */
authRouter.post('/login', validate(LoginSchema), authController.login);
authRouter.post('/refresh', validate(RefreshSchema), authController.refresh);
authRouter.post('/register', validate(PublicRegisterSchema), authController.publicRegister);

/** Protected routes - authentication required */
authRouter.post('/logout', requireAuth, validate(RefreshSchema), authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.post(
  '/change-password',
  requireAuth,
  validate(ChangePasswordSchema),
  authController.changePassword,
);

/** Registration is gated strictly on the backend — only admins may create users. */
authRouter.post(
  '/register',
  requireAuth,
  requirePermission('manage_users'),
  validate(RegisterSchema),
  authController.register,
);

/** Discovery of available permissions (read-only; any authenticated user) */
authRouter.get('/permissions', requireAuth, authController.permissions);

