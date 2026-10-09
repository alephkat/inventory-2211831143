import { prisma } from '../../shared/config/database.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { createAuditLog } from '../../shared/utils/audit.js';
import { PERMISSIONS } from '../../shared/types/permissions.js';
export class RoleService {
    async list() {
        return prisma.role.findMany({
            include: { permissions: { include: { permission: true } } },
            orderBy: { name: 'asc' },
        });
    }
    async get(id) {
        const role = await prisma.role.findUnique({
            where: { id },
            include: {
                permissions: { include: { permission: true } },
                _count: { select: { users: true } },
            },
        });
        if (!role)
            throw ApiError.notFound('Role not found');
        return role;
    }
    async create(data, userId) {
        const existing = await prisma.role.findUnique({ where: { name: data.name } });
        if (existing)
            throw ApiError.conflict('Role already exists');
        // Seed the permission catalogue alongside the role so a freshly created
        // role can be granted permissions without a separate migration step.
        await prisma.permission.createMany({
            data: PERMISSIONS.map((p) => ({
                name: p.name,
                value: p.value,
                description: p.description,
                resource: p.resource,
            })),
            skipDuplicates: true,
        });
        const role = await prisma.role.create({
            data: { name: data.name, description: data.description },
        });
        await createAuditLog({
            userId,
            action: 'CREATE',
            resourceType: 'role',
            resourceId: role.id,
            newValues: { name: role.name, description: role.description },
        });
        return role;
    }
    /**
     * Replace a role's permission set. Unknown values are rejected rather than
     * dropped: a typo in a permission name would otherwise quietly leave the
     * role under-privileged with no error to notice.
     */
    async assignPermissions(roleId, permissionValues, userId) {
        await this.get(roleId);
        const known = PERMISSIONS.map((p) => p.value);
        const unknown = permissionValues.filter((value) => !known.includes(value));
        if (unknown.length > 0) {
            throw ApiError.badRequest(`Unknown permission value(s): ${unknown.join(', ')}`);
        }
        const perms = await prisma.permission.findMany({
            where: { value: { in: permissionValues } },
        });
        const missing = permissionValues.filter((value) => !perms.some((p) => p.value === value));
        if (missing.length > 0) {
            throw ApiError.conflict(`These permissions are not registered yet: ${missing.join(', ')}. Create the role once to seed the catalogue.`);
        }
        const before = await prisma.rolePermission.findMany({
            where: { roleId },
            include: { permission: { select: { value: true } } },
        });
        await prisma.$transaction(async (tx) => {
            await tx.rolePermission.deleteMany({ where: { roleId } });
            if (perms.length > 0) {
                await tx.rolePermission.createMany({
                    data: perms.map((p) => ({ roleId, permissionId: p.id })),
                });
            }
        });
        await createAuditLog({
            userId,
            action: 'UPDATE',
            resourceType: 'role',
            resourceId: roleId,
            oldValues: { permissions: before.map((row) => row.permission.value).sort() },
            newValues: { permissions: [...permissionValues].sort() },
        });
        return this.get(roleId);
    }
}
export const roleService = new RoleService();
