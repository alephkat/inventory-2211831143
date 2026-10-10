/**
 * Creates the first user of a fresh database.
 *
 * There are no default credentials anywhere in this project: the username,
 * email and password are always supplied by the operator, e.g.
 *
 *   USERNAME=admin EMAIL=admin@example.com PASSWORD='correct horse battery staple' \
 *     npm run create-user
 *
 * Run it once against the empty Neon database, then sign in and create the
 * rest of the team from the Users page (or with `npm run create-user` again).
 * It is idempotent for the permission/role catalogue: those are structural
 * configuration, not data, and are (re)created only when missing.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PERMISSIONS } from '../src/shared/types/permissions.js';

const prisma = new PrismaClient();

/**
 * Permission grants per role.
 *
 * Each workflow is split between a permission that lets a role *propose* a
 * document and one that lets it *approve* it. A role never gets both for the
 * same workflow unless it is an administrator, so the approval queue stays a
 * real second pair of eyes rather than self-approval.
 */
const ROLES = [
    { name: 'super_admin', description: 'Full system access', permissions: PERMISSIONS.map((p) => p.value) },
    { name: 'admin', description: 'Administrative access', permissions: PERMISSIONS.map((p) => p.value) },
    {
        name: 'inventory_manager',
        description: 'Manage inventory operations and approve stock movements',
        permissions: [
            'view_inventory', 'add_product', 'edit_product', 'delete_product',
            'receive_stock', 'issue_stock', 'transfer_stock', 'adjust_stock', 'count_stock',
            'manage_stock_receipts', 'approve_stock_receipts', 'approve_stock_issues',
            'override_stock_issue', 'approve_stock_counts', 'approve_transactions',
            'manage_suppliers', 'manage_categories', 'manage_warehouses', 'manage_customers',
            'manage_purchase_orders', 'view_reports', 'export_reports',
        ],
    },
    {
        // Proposes movements on the floor; approvals belong to the manager above.
        name: 'storekeeper',
        description: 'Handle stock movements',
        permissions: [
            'view_inventory', 'receive_stock', 'issue_stock', 'transfer_stock',
            'count_stock', 'manage_stock_receipts', 'adjust_stock', 'view_reports',
        ],
    },
    {
        name: 'procurement_officer',
        description: 'Manage purchasing and supplier onboarding',
        permissions: [
            'view_inventory', 'manage_suppliers', 'manage_purchase_orders',
            'manage_stock_receipts', 'view_reports', 'export_reports',
        ],
    },
    {
        name: 'sales_officer',
        description: 'Manage sales',
        permissions: [
            'view_inventory', 'manage_customers', 'manage_sales_orders',
            'issue_stock', 'view_reports',
        ],
    },
    { name: 'auditor', description: 'View and audit data', permissions: ['view_inventory', 'view_reports', 'export_reports', 'view_audit_logs'] },
    { name: 'read_only', description: 'Read-only access', permissions: ['view_inventory'] },
];

const MIN_PASSWORD_LENGTH = 12;

function required(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value.trim();
}

/** Creates the permission and role catalogue when the database has none. */
async function ensureAccessControl() {
    const permissionCount = await prisma.permission.count();
    const roleCount = await prisma.role.count();
    if (permissionCount > 0 && roleCount > 0) {
        return false;
    }
    // Fail loudly on a typo in the table above; a silently under-provisioned
    // role only shows up later as a user who cannot do their job.
    const known = new Set(PERMISSIONS.map((p) => p.value));
    for (const role of ROLES) {
        const unknown = role.permissions.filter((value) => !known.has(value));
        if (unknown.length > 0) {
            throw new Error(`Role "${role.name}" references unregistered permission(s): ${unknown.join(', ')}`);
        }
    }
    for (const p of PERMISSIONS) {
        await prisma.permission.upsert({
            where: { value: p.value },
            update: { name: p.name, description: p.description, resource: p.resource },
            create: { name: p.name, value: p.value, description: p.description, resource: p.resource },
        });
    }
    for (const r of ROLES) {
        const role = await prisma.role.upsert({
            where: { name: r.name },
            update: { description: r.description },
            create: { name: r.name, description: r.description, isSystem: true },
        });
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        const permRows = await prisma.permission.findMany({ where: { value: { in: r.permissions } } });
        for (const perm of permRows) {
            await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
        }
    }
    return true;
}

async function main() {
    const username = required('USERNAME');
    const email = required('EMAIL');
    const password = process.env.PASSWORD;
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`PASSWORD is required and must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const roleName = (process.env.ROLE_NAME ?? 'super_admin').trim();

    const seededAccessControl = await ensureAccessControl();

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
        throw new Error(`Role "${roleName}" does not exist. Pick one of: ${ROLES.map((r) => r.name).join(', ')}`);
    }

    // Warehouse assignment is optional: the first user is usually the owner
    // and belongs to no specific warehouse.
    let warehouseId;
    if (process.env.WAREHOUSE_CODE) {
        const warehouse = await prisma.warehouse.findUnique({ where: { code: process.env.WAREHOUSE_CODE } });
        if (!warehouse) {
            throw new Error(`No warehouse with code "${process.env.WAREHOUSE_CODE}"`);
        }
        warehouseId = warehouse.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
        where: { username },
        update: { email, roleId: role.id, warehouseId, isActive: true, status: 'ACTIVE', passwordHash },
        create: {
            username,
            email,
            fullName: process.env.FULL_NAME?.trim() || username,
            passwordHash,
            roleId: role.id,
            warehouseId,
            status: 'ACTIVE',
            isActive: true,
        },
        select: { id: true, username: true, email: true, role: { select: { name: true } } },
    });

    // eslint-disable-next-line no-console
    console.log(`${seededAccessControl ? 'Access control seeded. ' : ''}User "${user.username}" (${user.email}) ready with role "${user.role.name}".`);
}

main()
    .catch((error) => {
    console.error(error.message);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
