import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import type { AuthenticatedUser } from '../types/permissions';
import { config } from '../config/env';

export { requirePermission, requireRole } from './rbac';

/**
 * Authentication middleware.
 * Verifies the JWT access token and hydrates `req.user` with the user's
 * id, username, role, and the full set of permission values granted to that
 * role — loaded fresh from the database on every request so permission
 * changes take effect immediately without a re-login.
 *
 * This is the SINGLE SOURCE OF TRUTH for authorization on the backend.
 * Client-side permission flags are convenience only and never trusted.
 */
export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return _res.status(401).json({
      success: false,
      message: 'Authorization header missing or malformed',
      code: 401,
    });
  }

  const token = authHeader.split(' ')[1];
  let payload: {
    sub: string;
    username: string;
    role: string;
    status: string;
  };
  try {
    payload = jwt.verify(token, config.jwt.accessSecret) as {
      sub: string;
      username: string;
      role: string;
      status: string;
    };
  } catch {
    return _res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code: 401,
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive) {
      return _res.status(401).json({
        success: false,
        message: 'User not found or inactive',
        code: 401,
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.value),
      status: user.status,
      warehouseId: user.warehouseId,
    } as AuthenticatedUser;

    next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Require an authenticated user; use after requireAuth.
 */
export const requireAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 401,
    });
  }
  next();
};
