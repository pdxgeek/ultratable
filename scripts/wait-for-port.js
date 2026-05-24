import { readFileSync } from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Resolution order when no explicit port arg is given (issue #120):
//   1. SERVICE_PORT in process env
//   2. SERVICE_PORT in root .env (written by scripts/setup.mjs)
//   3. 8080 — historical default; lets old clones that pre-date the
//      `npm run setup` port prompt continue to work without re-running it.
function readRootSvcPort() {
    if (process.env.SERVICE_PORT) return Number(process.env.SERVICE_PORT);
    try {
        const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
        const match = text.match(/^\s*SERVICE_PORT\s*=\s*(\S+)\s*$/m);
        return match ? Number(match[1]) : NaN;
    } catch {
        return NaN;
    }
}

const port = Number(process.argv[2]) || readRootSvcPort() || 8080;
const host = process.argv[3] || '127.0.0.1';
const timeoutMs = 30000;

const start = Date.now();

const tryConnect = () => {
    if (Date.now() - start > timeoutMs) {
        console.error(`wait-for-port: timed out after ${timeoutMs}ms waiting for ${host}:${port}`);
        process.exit(1);
    }
    const sock = net.connect(port, host);
    sock.once('connect', () => {
        sock.end();
        process.exit(0);
    });
    sock.once('error', () => {
        sock.destroy();
        setTimeout(tryConnect, 200);
    });
};

tryConnect();
