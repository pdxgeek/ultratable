import { db } from '../db';
import * as schema from '../db/schema';
import pino from 'pino';

// ── Types ─────────────────────────────────────────────────────
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

// ── Environment-driven log level ──────────────────────────────
// LOG_LEVEL env var controls verbosity. Falls back to:
//   - 'debug' in development (maximum visibility)
//   - 'info'  in production  (no debug noise)
// Valid values: 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

// ── Database Stream (info+ only) ──────────────────────────────
// Writes structured log entries to the system_logs table for the admin UI.
// Debug-level messages are filtered out — they're only for stdout/dev.
const drizzleStream = {
    write: (msg: string) => {
        try {
            const info = JSON.parse(msg);

            // Only persist info-level and above to the database
            // Pino levels: trace=10, debug=20, info=30, warn=40, error=50
            if (info.level < 30) return;

            let lvl = LogLevel.INFO;
            if (info.level >= 50) lvl = LogLevel.ERROR;
            else if (info.level >= 40) lvl = LogLevel.WARN;

            const message = info.msg || '';
            const mod = info.module || 'System';

            // Strip Pino internal properties from the DB context payload
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

// ── Stdout Transport ──────────────────────────────────────────
// In development: pino-pretty for human-readable colored output.
// In production:  raw JSON for log aggregators (ELK, Datadog, etc).
const stdoutStream = IS_PRODUCTION
    ? process.stdout
    : pino.transport({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
        }
    });

// ── Central Logger ────────────────────────────────────────────
export const globalLogger = pino(
    { level: LOG_LEVEL },
    pino.multistream([
        { stream: stdoutStream },   // Human-readable (dev) or JSON (prod)
        { stream: drizzleStream }   // Postgres / Admin UI (info+ only)
    ])
);

// Log the logger's own configuration on startup
globalLogger.info({ logLevel: LOG_LEVEL, env: process.env.NODE_ENV || 'development' }, '📋 Logger initialized');

// ── Legacy LogService Polyfill ────────────────────────────────
// Wraps globalLogger for modules still using the static API.
export class LogService {
    static async log(level: LogLevel, module: string, message: string, context?: Record<string, unknown>) {
        if (level === LogLevel.ERROR) {
            globalLogger.error({ module, ...context }, message);
        } else if (level === LogLevel.WARN) {
            globalLogger.warn({ module, ...context }, message);
        } else if (level === LogLevel.DEBUG) {
            globalLogger.debug({ module, ...context }, message);
        } else {
            globalLogger.info({ module, ...context }, message);
        }
    }

    static async debug(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.debug({ module, ...context }, message);
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
