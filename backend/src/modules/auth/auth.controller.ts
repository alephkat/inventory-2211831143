import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { PERMISSIONS } from '../../shared/types/permissions';

class AuthController {
  login = (req: Request, res: Response, next: NextFunction) => {
    authService
      .login(req.body.username, req.body.password)
      .then((result) => sendSuccess(res, result))
      .catch(next);
  };

  register = (req: Request, res: Response, next: NextFunction) => {
    authService
      .register(req.body, req.user!.id)
      .then((result) => sendSuccess(res, result, 'User registered'))
      .catch(next);
  };

  refresh = (req: Request, res: Response, next: NextFunction) => {
    authService
      .refreshToken(req.body.refreshToken)
      .then((result) => sendSuccess(res, result))
      .catch(next);
  };

  logout = (req: Request, res: Response, next: NextFunction) => {
    authService.logout(req.body.refreshToken).then((result) => sendSuccess(res, result)).catch(next);
  };

  me = (req: Request, res: Response, next: NextFunction) => {
    authService.me(req.user!.id).then((result) => sendSuccess(res, result)).catch(next);
  };

  changePassword = (req: Request, res: Response, next: NextFunction) => {
    authService
      .changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword)
      .then((result) => sendSuccess(res, result))
      .catch(next);
  };

  permissions = (_req: Request, res: Response) => {
    sendSuccess(res, {
      roles: ['super_admin', 'admin', 'inventory_manager', 'storekeeper', 'procurement_officer', 'sales_officer', 'auditor', 'read_only'],
      permissions: PERMISSIONS,
    });
  };
}

function sendSuccess(res: Response, data: unknown, message?: string) {
  return res.json({ success: true, data, message: message ?? null, meta: null });
}

export const authController = new AuthController();
