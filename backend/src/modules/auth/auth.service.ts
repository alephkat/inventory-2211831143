import { createHash } from 'node:crypto';
import type { JwtPayload } from '../../shared/utils/jwt';
import { JwtService } from '../../shared/utils/jwt';
import { PasswordService } from '../../shared/utils/password';
import { prisma } from '../../shared/config/database';
import { ApiError } from '../../shared/errors/ApiError';
import type { RegisterInput } from './auth.schema';
import { createAuditLog } from '../../shared/utils/audit';

export class AuthService {
  /**
   * Authenticate by username + password. Returns user info and tokens.
   * Permissions are attached server-side from the role, never from the client.
   */
  async login(username: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { username, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const valid = await PasswordService.compare(password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const tokens = await this.issueTokens(user);
    const userDto = this.toUserDto(user);

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      resourceType: 'auth',
      resourceId: user.id,
    });

    return { user: userDto, tokens };
  }

  async register(input: RegisterInput, adminUserId: string) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: input.username }, { email: input.email }] },
    });
    if (existing) {
      throw ApiError.conflict('Username or email already exists');
    }

    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) {
      throw ApiError.badRequest('Invalid role');
    }

    const passwordHash = await PasswordService.hash(input.password);
    const user = await prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        roleId: input.roleId,
        warehouseId: input.warehouseId ?? undefined,
        createdBy: adminUserId,
        status: 'ACTIVE',
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    await createAuditLog({
      userId: adminUserId,
      action: 'CREATE',
      resourceType: 'user',
      resourceId: user.id,
    });

    return this.toUserDto(user);
  }

  async refreshToken(refreshToken: string) {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    // Verifying here is the point: an expired or forged token throws before
    // any session lookup happens. The claims themselves are re-read from the
    // session's user below rather than trusted from the token.
    try {
      JwtService.verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const session = await prisma.userSession.findUnique({
      where: { refreshToken: refreshTokenHash },
      include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!session || session.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh session expired or invalid');
    }

    const user = session.user;
    await prisma.userSession.delete({ where: { id: session.id } });

    const tokens = await this.issueTokens(user);
    const userDto = this.toUserDto(user);
    return { user: userDto, tokens };
  }

  async logout(refreshToken: string) {
    await prisma.userSession.deleteMany({ where: { refreshToken: this.hashRefreshToken(refreshToken) } });
    return { success: true };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return this.toUserDto(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    const valid = await PasswordService.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Current password is incorrect');
    }
    const passwordHash = await PasswordService.hash(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await createAuditLog({ userId, action: 'UPDATE', resourceType: 'user', resourceId: userId });
    return { success: true };
  }

  private async issueTokens(user: any) {
    // Permissions are deliberately not embedded in the token: the auth
    // middleware re-reads them from the database on every request so a role
    // change takes effect immediately instead of at token expiry.
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role.name,
      status: user.status,
    };
    const accessToken = JwtService.signAccessToken(payload);
    const refreshToken = JwtService.signRefreshToken(payload);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshToken: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: undefined,
        ipAddress: undefined,
      },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private toUserDto(user: any) {
    const permissions = user.role.permissions.map((rp: any) => rp.permission.value);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      roleId: user.role.id,
      permissions,
      status: user.status,
      isActive: user.isActive,
      profileImage: user.profileImage,
      warehouseId: user.warehouseId,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdBy: user.createdBy,
    };
  }
}

export const authService = new AuthService();
