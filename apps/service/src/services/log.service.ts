import { db } from '../db';
import * as schema from '../db/schema';

export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

export class LogService {
    static async log(level: LogLevel, module: string, message: string, context?: any) {
        console.log(`[${level.toUpperCase()}][${module}] ${message}`, context ? JSON.stringify(context) : '');

        try {
            await db.insert(schema.systemLogs).values({
                level,
                module,
                message,
                context: context || null
            });
        } catch (e) {
            console.error('Failed to write to system_logs table:', e);
        }
    }

    static async info(module: string, message: string, context?: any) {
        await this.log(LogLevel.INFO, module, message, context);
    }

    static async warn(module: string, message: string, context?: any) {
        await this.log(LogLevel.WARN, module, message, context);
    }

    static async error(module: string, message: string, context?: any) {
        await this.log(LogLevel.ERROR, module, message, context);
    }
}
