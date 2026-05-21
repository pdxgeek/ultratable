import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
    db: {
        insert: vi.fn(),
    },
}));

describe('LogService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    describe('LogLevel enum', () => {
        it('exports correct log level values', async () => {
            const { LogLevel } = await import('./log.service');
            expect(LogLevel.INFO).toBe('info');
            expect(LogLevel.WARN).toBe('warn');
            expect(LogLevel.ERROR).toBe('error');
        });
    });

    describe('LogService static methods', () => {
        it('delegates info() to pino logger', async () => {
            const { LogService, globalLogger } = await import('./log.service');
            const spy = vi.spyOn(globalLogger, 'info').mockImplementation(() => undefined as never);

            await LogService.info('TestModule', 'test message', { key: 'val' });

            expect(spy).toHaveBeenCalledWith({ module: 'TestModule', key: 'val' }, 'test message');
        });

        it('delegates warn() to pino logger', async () => {
            const { LogService, globalLogger } = await import('./log.service');
            const spy = vi.spyOn(globalLogger, 'warn').mockImplementation(() => undefined as never);

            await LogService.warn('TestModule', 'warning msg');

            expect(spy).toHaveBeenCalledWith({ module: 'TestModule' }, 'warning msg');
        });

        it('delegates error() to pino logger', async () => {
            const { LogService, globalLogger } = await import('./log.service');
            const spy = vi
                .spyOn(globalLogger, 'error')
                .mockImplementation(() => undefined as never);

            await LogService.error('TestModule', 'error msg');

            expect(spy).toHaveBeenCalledWith({ module: 'TestModule' }, 'error msg');
        });

        it('log() routes ERROR level correctly', async () => {
            const { LogService, LogLevel, globalLogger } = await import('./log.service');
            const spy = vi
                .spyOn(globalLogger, 'error')
                .mockImplementation(() => undefined as never);

            await LogService.log(LogLevel.ERROR, 'Mod', 'err');

            expect(spy).toHaveBeenCalledWith({ module: 'Mod' }, 'err');
        });

        it('log() routes WARN level correctly', async () => {
            const { LogService, LogLevel, globalLogger } = await import('./log.service');
            const spy = vi.spyOn(globalLogger, 'warn').mockImplementation(() => undefined as never);

            await LogService.log(LogLevel.WARN, 'Mod', 'wrn');

            expect(spy).toHaveBeenCalledWith({ module: 'Mod' }, 'wrn');
        });

        it('log() routes INFO level correctly', async () => {
            const { LogService, LogLevel, globalLogger } = await import('./log.service');
            const spy = vi.spyOn(globalLogger, 'info').mockImplementation(() => undefined as never);

            await LogService.log(LogLevel.INFO, 'Mod', 'inf');

            expect(spy).toHaveBeenCalledWith({ module: 'Mod' }, 'inf');
        });
    });
});
