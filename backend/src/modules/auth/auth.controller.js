import { authService } from './auth.service.js';
import { PERMISSIONS } from '../../shared/types/permissions.js';

class AuthController {
 login = (req, res, next) => {
 authService
 .login(req.body.username, req.body.password, req)
 .then((result) => sendSuccess(res, result))
 .catch(next);
 };

 register = (req, res, next) => {
 authService
 .register(req.body, req.user.id, req)
 .then((result) => sendSuccess(res, result, 'User registered'))
 .catch(next);
 };

 publicRegister = (req, res, next) => {
 authService
 .publicRegister(req.body, req)
 .then((result) => sendSuccess(res, result, 'Registration submitted'))
 .catch(next);
 };

 refresh = (req, res, next) => {
 authService
 .refreshToken(req.body.refreshToken, req)
 .then((result) => sendSuccess(res, result))
 .catch(next);
 };

 logout = (req, res, next) => {
 authService.logout(req.user.id, req.body.refreshToken, req).then((result) => sendSuccess(res, result)).catch(next);
 };

 me = (req, res, next) => {
 authService.me(req.user.id).then((result) => sendSuccess(res, result)).catch(next);
 };

 changePassword = (req, res, next) => {
 authService
 .changePassword(req.user.id, req.body.currentPassword, req.body.newPassword)
 .then((result) => sendSuccess(res, result))
 .catch(next);
 };

 captcha = (_req, res) => {
 const { token, question } = authService.generateCaptcha();
 sendSuccess(res, { token, question });
 };

 permissions = (_req, res) => {
 sendSuccess(res, {
 roles: ['super_admin', 'admin', 'inventory_manager', 'storekeeper', 'procurement_officer', 'sales_officer', 'auditor', 'read_only'],
 permissions: PERMISSIONS,
 });
 };
}

function sendSuccess(res, data, message) {
 return res.json({ success: true, data, message: message ?? null, meta: null });
}

export const authController = new AuthController();