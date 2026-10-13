import { PrismaClient } from '@prisma/client';
import { config } from './env.js';
/**
 * Prisma derives its connection pool size from the datasource URL.
 * Cloud providers (Render, Neon) hand out bare URLs, so the client
 * falls back to `num_physical_cpus * 2 + 1` connections — on a small
 * container that overshoots the database's max_connections and every
 * request queues behind pool timeouts. Pin a small pool and a generous
 * wait, unless the URL already tunes them (an explicit setting wins).
 */
const pooledDatabaseUrl = (url) => {
    const params = [];
    if (!/[?&]connection_limit=\d/.test(url)) {
        params.push(`connection_limit=${config.db.poolSize}`);
    }
    if (!/[?&]pool_timeout=\d/.test(url)) {
        params.push(`pool_timeout=${config.db.poolTimeout}`);
    }
    if (params.length === 0) {
        return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
};
const prismaClient = () => {
    const options = {
        datasources: { db: { url: pooledDatabaseUrl(config.databaseUrl) } },
    };
    if (config.isProduction) {
        return new PrismaClient(options);
    }
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            ...options,
            log: ['query', 'error', 'warn'],
        });
    }
    return global.prisma;
};
export const prisma = prismaClient();
