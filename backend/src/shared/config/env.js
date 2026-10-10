/**
 * Environment configuration.
 * Loads and validates required environment variables.
 */
const requiredEnvs = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
const missing = requiredEnvs.filter((k) => !process.env[k]);
if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env.`);
}
const isProduction = process.env.NODE_ENV === 'production';
const weakSecret = (value) => value && (value.includes('change-me') || value.includes('replace-with') || value.length < 32);
if (isProduction && (weakSecret(process.env.JWT_ACCESS_SECRET) || weakSecret(process.env.JWT_REFRESH_SECRET))) {
    throw new Error('Production JWT secrets must be distinct random values of at least 32 characters');
}
// Skip localhost check in production for cloud providers like Render, Railway, etc.
function configOriginIsWildcard() {
    return (process.env.CORS_ORIGIN ?? '*') === '*';
}
if (isProduction && configOriginIsWildcard()) {
    throw new Error('Production CORS_ORIGIN must be an explicit allowlist');
}
export const config = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '4000', 10),
    isProduction: process.env.NODE_ENV === 'production',
    databaseUrl: process.env.DATABASE_URL,
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    bcrypt: {
        saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    },
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
};