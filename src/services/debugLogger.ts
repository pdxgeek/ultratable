export interface LogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    stack?: string;
}

const MAX_LOGS = 100;
const STORAGE_KEY = 'ultratable_debug_logs';

class DebugLogger {
    private logs: LogEntry[] = [];

    constructor() {
        this.load();
    }

    private load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                this.logs = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load logs', e);
        }
    }

    private save() {
        try {
            // Persist only last 50 to avoid quota issues
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(-50)));
        } catch (e) {
            console.warn('Failed to save logs', e);
        }
    }

    log(level: 'info' | 'warn' | 'error', message: string, error?: any) {
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            stack: error instanceof Error ? error.stack : undefined
        };

        this.logs.unshift(entry);
        if (this.logs.length > MAX_LOGS) {
            this.logs.pop();
        }
        this.save();
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
        this.save();
    }

    export() {
        return JSON.stringify(this.logs, null, 2);
    }

    init() {
        // Capture global errors
        const originalError = console.error;
        console.error = (...args) => {
            this.log('error', args.map(a => String(a)).join(' '));
            originalError.apply(console, args);
        };

        const originalWarn = console.warn;
        console.warn = (...args) => {
            this.log('warn', args.map(a => String(a)).join(' '));
            originalWarn.apply(console, args);
        };

        window.onerror = (msg, url, line, col, error) => {
            this.log('error', `Global: ${msg} at ${url}:${line}:${col}`, error);
        };

        window.onunhandledrejection = (event) => {
            this.log('error', `Unhandled Rejection: ${event.reason}`);
        };
    }
}

export const debugLogger = new DebugLogger();
