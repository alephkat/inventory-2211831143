/**
 * Creates a user. This is the only way accounts come into existence: there are
 * no default credentials anywhere in this project and the username, email and
 * password are always supplied by the operator, e.g.
 *
 *   USERNAME=admin EMAIL=admin@example.com PASSWORD='correct horse battery staple' \
 *     npm run create-user
 *
 * Roles are a fixed enum (see schema.prisma) whose permission mapping lives in
 * src/shared/types/permissions.js, so nothing needs to be seeded first.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { ROLE_VALUES } from '../src/shared/types/permissions.js';

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;

function required(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value.trim();
}

async function main() {
    const username = required('USERNAME');
    const email = required('EMAIL');
    const password = process.env.PASSWORD;
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`PASSWORD is required and must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const roleName = (process.env.ROLE_NAME ?? 'super_admin').trim();
    if (!ROLE_VALUES.includes(roleName)) {
        throw new Error(`Role "${roleName}" does not exist. Pick one of: ${ROLE_VALUES.join(', ')}`);
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
        update: { email, role: roleName, warehouseId, isActive: true, status: 'ACTIVE', passwordHash },
        create: {
            username,
            email,
            fullName: process.env.FULL_NAME?.trim() || username,
            passwordHash,
            role: roleName,
            warehouseId,
            status: 'ACTIVE',
            isActive: true,
        },
        select: { id: true, username: true, email: true, role: true },
    });

    // eslint-disable-next-line no-console
    console.log(`User "${user.username}" (${user.email}) ready with role "${user.role}".`);
}

main()
    .catch((error) => {
    console.error(error.message);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
