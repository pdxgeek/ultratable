import { db } from '../db';
import * as schema from '../db/schema';
import winston from 'winston';
import Transport from 'winston-transport';

// 1. Types for Winston
export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

// 2. Custom Winston Transport for Postgres
class DrizzleTransport extends Transport {
    constructor(opts?: Transport.TransportStreamOptions) {
        super(opts);
    }

    log(info: Record<string, unknown>, callback: () => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Ensure we gracefully format to database schema
        const lvl = info.level as LogLevel;
        const msg = info.message as string;
        const mod = (info.module as string) || 'System';

        // Filter out winston core symbols for the context JSON payload
        const context = { ...info };
        delete context.level;
        delete context.message;
        delete context.module;
        const cleanContext = Object.keys(context).length > 0 ? context : null;

        db.insert(schema.systemLogs).values({
            level: lvl,
            module: mod,
            message: msg,
            context: cleanContext
        }).catch((e: Error) => {
            console.error('[Logger] Failed to write system_log to database:', e.message);
        });

        callback();
    }
}

// 3. Central Logger Configuration
export const globalLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Standard Output formatting
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf((info) => {
                    const mod = info.module ? `[${info.module}] ` : '';
                    return `${info.timestamp} ${info.level}: ${mod}${info.message}`;
                })
            )
        }),
        // Postgres / Admin UI Intercept
        new DrizzleTransport()
    ]
});

// Polyfill old static methods so we don't break un-migrated code instantly
export class LogService {
    static async log(level: LogLevel, module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.log(level, message, { module, ...context });
    }

    static async info(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.info(message, { module, ...context });
    }

    static async warn(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.warn(message, { module, ...context });
    }

    static async error(module: string, message: string, context?: Record<string, unknown>) {
        globalLogger.error(message, { module, ...context });
    }
}
