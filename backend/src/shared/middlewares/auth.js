import jwt from 'jsonwebtoken';
import { permissionsForRole } from '../types/permissions.js';
import { prisma } from '../config/database.js';
import { config } from '../config/env.js';
export { requirePermission, requireRole } from './rbac.js';
/**
 * Authentication middleware.
 * Verifies the JWT access token and hydrates `req.user` with the user's
 * id, username, role, and the permission values that role maps to in
 * permissions.js.
 *
 * This is the SINGLE SOURCE OF TRUTH for authorization on the backend.
 * Client-side permission flags are convenience only and never trusted.
 */
export const requireAuth = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return _res.status(401).json({
            success: false,
            message: 'Authorization header missing or malformed',
            code: 401,
        });
    }
    const token = authHeader.split(' ')[1];
    let payload;
    try {
        payload = jwt.verify(token, config.jwt.accessSecret);
    }
    catch {
        return _res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            code: 401,
        });
    }
    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
        });
        if (!user || !user.isActive || user.status !== 'ACTIVE') {
            return _res.status(401).json({
                success: false,
                message: 'User not found or inactive',
                code: 401,
            });
        }
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            permissions: permissionsForRole(user.role),
            status: user.status,
            warehouseId: user.warehouseId,
        };
        next();
    }
    catch (err) {
        return next(err);
    }
};
/**
 * Require an authenticated user; use after requireAuth.
 */
export const requireAuthenticated = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            code: 401,
        });
    }
    next();
};
