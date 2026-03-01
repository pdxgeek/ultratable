import { db } from '../db';
import * as schema from '../db/schema';
import pino from 'pino';

// 1. Types
export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

// 2. Custom Stream for Postgres
const drizzleStream = {
    write: (msg: string) => {
        try {
            const info = JSON.parse(msg);

            // Map Pino levels to our DB LogLevel enum
            let lvl = LogLevel.INFO;
            if (info.level >= 50) lvl = LogLevel.ERROR;
            else if (info.level >= 40) lvl = LogLevel.WARN;

            const message = info.msg || '';
            const mod = info.module || 'System';

            // Filter out Pino core properties for the DB context JSON payload
            const context = { ...info };
            delete context.level;
            delete context.msg;
            delete context.module;
            delete context.time;
            delete context.pid;
            delete context.hostname;
            const cleanContext = Object.keys(context).length > 0 ? context : null;

            db.insert(schema.systemLogs).values({
                level: lvl,
                module: mod,
                message: message,
                context: cleanContext
            }).catch((e: Error) => {
                console.error('[Logger] Failed to write system_log to database:', e.message);
            });
        } catch (err) {
            console.error('[Logger] Failed to parse pino message for database:', err);
        }
    }
};

// 3. Central Logger Configuration
export const globalLogger = pino(
    {
        level: 'info',
        // We will output beautifully formatted logs to stdout, and the raw JSON to our DB stream
    },
    pino.multistream([
        { stream: process.stdout }, // Standard Output
        { stream: drizzleStream }   // Postgres / Admin UI Intercept
    ])
);

// Polyfill old static methods so we don't break un-migrated code instantly
export class LogService {
    static async log(level: LogLevel, module: string, message: string, context?: Record<string, unknown>) {
        if (level === LogLevel.ERROR) {
            globalLogger.error({ module, ...context }, message);
        } else if (level === LogLevel.WARN) {
            globalLogger.warn({ module, ...context }, message);
        } else {
            globalLogger.info({ module, ...context }, message);
        }
    }

    static async info(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.info({ module, ...context }, message);
    }

    static async warn(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.warn({ module, ...context }, message);
    }

    static async error(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.error({ module, ...context }, message);
    }
}
