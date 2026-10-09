import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './shared/config/env.js';
import { notFoundHandler } from './shared/middlewares/notFound.js';
import { errorHandler } from './shared/errors/errorHandler.js';
import { requireAuth } from './shared/middlewares/auth.js';
import { registerRoutes } from './routes/index.js';
import { authRouter } from './modules/auth/auth.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIST = path.resolve(__dirname, '../../frontend/dist');
const hasWebBuild = fs.existsSync(path.join(WEB_DIST, 'index.html'));

export const createApp = () => {
    const app = express();
    if (!config.isProduction) {
        app.use(morgan('dev'));
    }
    app.use(helmet());
    app.use(cors({
        origin: config.corsOrigin,
        credentials: true,
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: 'Too many requests' },
    });
    app.use(limiter);
    app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1', requireAuth, registerRoutes);
    if (hasWebBuild) {
        app.use(express.static(WEB_DIST, { index: false, maxAge: '1y' }));
        app.get(/^\/(?!api\/).*/, (_req, res) => {
            res.sendFile(path.join(WEB_DIST, 'index.html'));
        });
    }
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
};
export default createApp;