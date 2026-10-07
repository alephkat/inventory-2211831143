import { PrismaClient } from '@prisma/client';
import { config } from './env.js';

const globalForPrisma = globalThis;

const prismaClient = () => {
 if (config.isProduction) {
 return new PrismaClient();
 }
 if (!globalForPrisma.prisma) {
 globalForPrisma.prisma = new PrismaClient({
 log: ['query', 'error', 'warn'],
 });
 }
 return globalForPrisma.prisma;
};

export const prisma = prismaClient();