import { PrismaClient } from '@prisma/client';
import { config } from './env.js';
const prismaClient = () => {
    if (config.isProduction) {
        return new PrismaClient();
    }
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['query', 'error', 'warn'],
        });
    }
    return global.prisma;
};
export const prisma = prismaClient();
