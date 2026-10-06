// Loads .env before PrismaClient is constructed. Without this the datasource
// URL is missing and the very first query fails with a confusing
// "Environment variable not found: DATABASE_URL".
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PERMISSIONS } from './shared/types/permissions';

const prisma = new PrismaClient();

type RoleDef = {
  name: string;
  description: string;
  permissions: string[];
};

/**
 * Permission grants per role.
 *
 * Each workflow is split between a permission that lets a role *propose* a
 * document and one that lets it *approve* it. A role never gets both for the
 * same workflow unless it is an administrator, so the approval queue stays a
 * real second pair of eyes rather than self-approval.
 */
const ROLES: RoleDef[] = [
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

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed cannot run in production');
  }
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString('base64url');
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated seed admin password: ${adminPassword}`);
  }
  // Fail loudly on a typo in the table above. `findMany` would otherwise
  // return fewer rows than requested and quietly seed a role that is missing
  // a permission nobody notices until a user cannot do their job.
  const known = new Set(PERMISSIONS.map((p) => p.value));
  for (const role of ROLES) {
    const unknown = role.permissions.filter((value) => !known.has(value));
    if (unknown.length > 0) {
      throw new Error(
        `Role "${role.name}" references unregistered permission(s): ${unknown.join(', ')}`,
      );
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

  // `code` is the only unique field on Warehouse, so it is the upsert key.
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: { name: 'Main Warehouse', code: 'WH-001', address: '123 Inventory St', isActive: true },
  });

  const adminRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: adminRole!.id,
      warehouseId: warehouse.id,
      isActive: true,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      username: 'admin',
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: adminRole!.id,
      warehouseId: warehouse.id,
      status: 'ACTIVE',
      isActive: true,
      passwordHash,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete: permissions, roles, warehouse, admin user created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
