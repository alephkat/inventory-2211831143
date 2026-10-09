import { createHash } from 'node:crypto';
import { JwtService } from '../../shared/utils/jwt.js';
import { PasswordService } from '../../shared/utils/password.js';
import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { notificationService } from '../../modules/notifications/notifications.service.js';
import { NotificationPriority, NotificationType } from '@prisma/client';
function getUserAgent(req) {
    const val = req?.headers['user-agent'];
    if (typeof val === 'string')
        return val;
    return undefined;
}
export class AuthService {
    captchaStore = new Map();
    generateCaptcha() {
        const a = Math.floor(Math.random() * 10) + 1;
        const b = Math.floor(Math.random() * 10) + 1;
        const answer = a + b;
        const token = Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
        this.captchaStore.set(token, { answer, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
        return { token, question: `What is ${a} + ${b}?` };
    }
    verifyCaptcha(token, answer) {
        const entry = this.captchaStore.get(token);
        if (!entry || entry.expiresAt < new Date())
            return false;
        this.captchaStore.delete(token);
        return entry.answer === answer;
    }
    getClientIp(req) {
        return req?.ip || req?.socket?.remoteAddress;
    }
    async login(username, password, req) {
        const user = await prisma.user.findFirst({
            where: { username, isActive: true, status: 'ACTIVE' },
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
        const tokens = await this.issueTokens(user, getUserAgent(req), this.getClientIp(req));
        const userDto = this.toUserDto(user);
        await createAuditLog({
            userId: user.id,
            action: 'LOGIN',
            resourceType: 'auth',
            resourceId: user.id,
            ipAddress: this.getClientIp(req),
            userAgent: getUserAgent(req),
        });
        return { user: userDto, tokens };
    }
    async register(input, adminUserId, req) {
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
            ipAddress: this.getClientIp(req),
            userAgent: getUserAgent(req),
        });
        return this.toUserDto(user);
    }
    async publicRegister(input, req) {
        const captchaValid = this.verifyCaptcha(input.captchaToken, input.captchaAnswer);
        if (!captchaValid) {
            throw ApiError.badRequest('Invalid CAPTCHA');
        }
        const existing = await prisma.user.findFirst({
            where: { OR: [{ username: input.username }, { email: input.email }] },
        });
        if (existing) {
            throw ApiError.conflict('Registration is currently unavailable');
        }
        const defaultRole = await prisma.role.findUnique({ where: { name: 'read_only' } });
        if (!defaultRole) {
            throw ApiError.badRequest('Default role not configured');
        }
        const defaultWarehouse = await prisma.warehouse.findFirst({ where: { isActive: true } });
        if (!defaultWarehouse) {
            throw ApiError.badRequest('No active warehouse configured');
        }
        const passwordHash = await PasswordService.hash(input.password);
        const user = await prisma.user.create({
            data: {
                username: input.username,
                email: input.email,
                fullName: input.fullName,
                passwordHash,
                roleId: defaultRole.id,
                warehouseId: defaultWarehouse.id,
                status: 'PENDING_APPROVAL',
                isActive: false,
            },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
        });
        await prisma.user.update({ where: { id: user.id }, data: { createdBy: user.id } });
        await createAuditLog({
            userId: user.id,
            action: 'CREATE',
            resourceType: 'user',
            resourceId: user.id,
            ipAddress: this.getClientIp(req),
            userAgent: getUserAgent(req),
        });
        notificationService.dispatchToPermissions(['manage_users'], {
            title: 'New registration pending approval',
            body: `${input.fullName} (${input.username}) has requested an account.`,
            type: NotificationType.SYSTEM,
            priority: NotificationPriority.HIGH,
            data: { userId: user.id, username: input.username, email: input.email },
        }).catch(() => { });
        return { success: true, message: 'Registration submitted. Awaiting admin approval.' };
    }
    async refreshToken(refreshToken, req) {
        const refreshTokenHash = this.hashRefreshToken(refreshToken);
        try {
            JwtService.verifyRefreshToken(refreshToken);
        }
        catch {
            throw ApiError.unauthorized('Invalid refresh token');
        }
        const session = await prisma.userSession.findFirst({
            where: { refreshToken: refreshTokenHash, expiresAt: { gt: new Date() } },
            include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        });
        if (!session) {
            throw ApiError.unauthorized('Refresh session expired or invalid');
        }
        await prisma.userSession.delete({ where: { id: session.id } });
        const user = session.user;
        const tokens = await this.issueTokens(user, getUserAgent(req), this.getClientIp(req));
        const userDto = this.toUserDto(user);
        return { user: userDto, tokens };
    }
    async logout(userId, refreshToken, _req) {
        try {
            JwtService.verifyRefreshToken(refreshToken);
        }
        catch {
            throw ApiError.unauthorized('Invalid refresh token');
        }
        const refreshTokenHash = this.hashRefreshToken(refreshToken);
        const session = await prisma.userSession.findFirst({
            where: { userId, refreshToken: refreshTokenHash },
        });
        if (!session) {
            throw ApiError.notFound('Session not found');
        }
        await prisma.userSession.delete({ where: { id: session.id } });
        return { success: true };
    }
    async me(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
        });
        if (!user) {
            throw ApiError.notFound('User not found');
        }
        return this.toUserDto(user);
    }
    async changePassword(userId, currentPassword, newPassword) {
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
    async issueTokens(user, userAgent, ipAddress) {
        const payload = {
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
                userAgent: userAgent ?? undefined,
                ipAddress: ipAddress ?? undefined,
            },
        });
        return { accessToken, refreshToken, tokenType: 'Bearer', expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
    }
    hashRefreshToken(refreshToken) {
        return createHash('sha256').update(refreshToken).digest('hex');
    }
    toUserDto(user) {
        const permissions = user.role.permissions.map((rp) => rp.permission.value);
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
