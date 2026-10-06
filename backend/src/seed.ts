// Loads .env before PrismaClient is constructed. Without this the datasource
// URL is missing and the very first query fails with a confusing
// "Environment variable not found: DATABASE_URL".
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed cannot run in production');
  }

  // Default admin password - change in production via ADMIN_DEFAULT_PASSWORD env var
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD ?? 'Admin@12345';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Ensure super_admin role exists
  const adminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: { description: 'Full system access' },
    create: { name: 'super_admin', description: 'Full system access', isSystem: true },
  });

  // Ensure default warehouse exists
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: { name: 'Main Warehouse', code: 'WH-001', address: '123 Inventory St', isActive: true },
  });

  // Create or update default admin user
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: adminRole.id,
      warehouseId: warehouse.id,
      isActive: true,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      username: 'admin',
      email: 'admin@inventory.local',
      fullName: 'System Administrator',
      roleId: adminRole.id,
      warehouseId: warehouse.id,
      status: 'ACTIVE',
      isActive: true,
      passwordHash,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete: admin user created/updated with default password.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });