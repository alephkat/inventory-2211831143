import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { requireAuth, requirePermission } from '../../shared/middlewares/auth.js';
import rateLimit from 'express-rate-limit';
import {
 LoginSchema,
 RegisterSchema,
 PublicRegisterSchema,
 RefreshSchema,
 ChangePasswordSchema,
} from './auth.schema.js';

export const authRouter = Router();

const registerLimiter = rateLimit({
 windowMs: 15 * 60 * 1000,
 max: 5,
 standardHeaders: true,
 legacyHeaders: false,
 message,
});

/** Public routes */
authRouter.post('/login', validate(LoginSchema), authController.login);
authRouter.post('/refresh', validate(RefreshSchema), authController.refresh);
authRouter.get('/captcha', authController.captcha);
authRouter.post('/register', registerLimiter, validate(PublicRegisterSchema), authController.publicRegister);

/** Protected routes - authentication required */
authRouter.post('/logout', requireAuth, validate(RefreshSchema), authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.post(
 '/change-password',
 requireAuth,
 validate(ChangePasswordSchema),
 authController.changePassword);

/** Admin-only user creation. Moved to /register/admin to avoid shadowing the
 * self-registration route. */
authRouter.post(
 '/register/admin',
 requireAuth,
 requirePermission('manage_users'),
 validate(RegisterSchema),
 authController.register);

/** Discovery of available permissions (read-only; any authenticated user) */
authRouter.get('/permissions', requireAuth, authController.permissions);

