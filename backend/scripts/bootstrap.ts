import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PERMISSIONS } from '../src/shared/types/permissions';

const prisma = new PrismaClient();

function generateTempPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const suffix = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Admin_${suffix}`;
}

async function ensurePermissions() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { value: perm.value },
      update: { name: perm.name, description: perm.description, resource: perm.resource },
      create: { name: perm.name, value: perm.value, description: perm.description, resource: perm.resource },
    });
  }
}

async function ensureRoles() {
  const perms = await prisma.permission.findMany();
  const byValue = new Map(perms.map((p) => [p.value, p]));

  const roleDefinitions: { name: string; description: string; permissions: string[] }[] = [
    { name: 'super_admin', description: 'Full system access', permissions: PERMISSIONS.map((p) => p.value) },
    { name: 'admin', description: 'Administrative access', permissions: PERMISSIONS.map((p) => p.value) },
    { name: 'inventory_manager', description: 'Manage products and stock movements', permissions: ['view_inventory', 'add_product', 'edit_product', 'delete_product', 'receive_stock', 'issue_stock', 'transfer_stock', 'adjust_stock', 'count_stock', 'manage_stock_receipts', 'approve_stock_receipts', 'approve_stock_issues', 'approve_stock_counts', 'manage_suppliers', 'manage_categories', 'manage_warehouses', 'manage_customers', 'manage_purchase_orders', 'manage_sales_orders', 'view_reports', 'export_reports', 'approve_transactions', 'view_audit_logs'] },
    { name: 'storekeeper', description: 'Receive, transfer and issue stock', permissions: ['view_inventory', 'receive_stock', 'issue_stock', 'transfer_stock', 'count_stock', 'view_reports'] },
    { name: 'procurement_officer', description: 'Manage suppliers and purchase orders', permissions: ['view_inventory', 'manage_suppliers', 'manage_purchase_orders', 'view_reports', 'export_reports'] },
    { name: 'sales_officer', description: 'Manage customers and sales orders', permissions: ['view_inventory', 'manage_customers', 'manage_sales_orders', 'view_reports', 'export_reports'] },
    { name: 'auditor', description: 'View inventory, reports and audit logs', permissions: ['view_inventory', 'view_reports', 'export_reports', 'view_audit_logs'] },
    { name: 'read_only', description: 'View inventory only', permissions: ['view_inventory'] },
  ];

  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { description: def.description, isSystem: true },
      create: { name: def.name, description: def.description, isSystem: true },
    });

    const existingLinks = await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } });
    const existingSet = new Set(existingLinks.map((l) => l.permissionId));

    const links = def.permissions
      .map((val) => byValue.get(val))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .filter((p) => !existingSet.has(p.id))
      .map((p) => ({ roleId: role.id, permissionId: p.id }));

    if (links.length > 0) {
      await prisma.rolePermission.createMany({ data: links, skipDuplicates: true });
    }
  }
}

async function ensureWarehouse() {
  await prisma.warehouse.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: { name: 'Main Warehouse', code: 'WH-001', address: '123 Inventory St', isActive: true },
  });
}

async function ensureAdmin() {
  const warehouse = await prisma.warehouse.findFirst({ where: { isActive: true } });
  if (!warehouse) {
    throw new Error('No active warehouse found; run warehouse seed first');
  }

  const role = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  if (!role) {
    throw new Error('super_admin role not found; run role seed first');
  }

  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD ?? generateTempPassword();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: role.id,
      warehouseId: warehouse.id,
      isActive: true,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      username: 'admin',
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: role.id,
      warehouseId: warehouse.id,
      status: 'ACTIVE',
      isActive: true,
      passwordHash,
    },
  });
}

async function main() {
  const userCount = await prisma.user.count();
  const permCount = await prisma.permission.count();

  if (permCount === 0) {
    await ensurePermissions();
    await ensureRoles();
    await ensureWarehouse();
    await ensureAdmin();
    console.log('Bootstrap complete: fresh database seeded.');
  } else if (userCount === 0) {
    await ensureWarehouse();
    await ensureAdmin();
    console.log('Bootstrap complete: admin user and warehouse created.');
  } else {
    console.log('Bootstrap skipped: database already initialized.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
