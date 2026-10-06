import { PrismaClient } from '@prisma/client';
import { config } from './env';

declare global {
  // allow global prism for hot-reload friendly reuse
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

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
