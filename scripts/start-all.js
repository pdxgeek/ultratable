import { exec, spawn } from 'child_process';
import { readFileSync } from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Ports are sourced from the root .env (written by scripts/setup.mjs), with
// process-env taking precedence and the historical numbers as the final
// fallback — see issue #120.
function loadRootEnv() {
    try {
        const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
        const env = {};
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
        return env;
    } catch {
        return {};
    }
}
const rootEnv = loadRootEnv();
function readPort(name, fallback) {
    return Number(process.env[name] || rootEnv[name]) || fallback;
}
const API_PORT = readPort('SERVICE_PORT', 8080);
const ADMIN_PORT = readPort('ADMIN_PORT', 5174);
const WEB_PORT = readPort('WEB_PORT', 5175);
const ALL_PORTS = [API_PORT, ADMIN_PORT, WEB_PORT];

// Process patterns that we consider "ours" — anything matching one of these
// AND running from this repo is fair game for the orphan sweep. Matching by
// repo path prevents us from killing an unrelated ts-node or vite the user
// has running in another project.
const ORPHAN_PATTERNS = [
    'ts-node src/index.ts', // service (nodemon's child)
    'nodemon --watch src', // service supervisor
    'vite', // web/admin Vite dev server
    'concurrently npm:start:', // the supervisor that runs the three above
];

function execP(cmd) {
    return new Promise((resolve) => {
        exec(cmd, (error, stdout, stderr) => {
            resolve({ error, stdout: stdout?.trim() ?? '', stderr: stderr?.trim() ?? '' });
        });
    });
}

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            resolve(err.code === 'EADDRINUSE');
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

async function killByPort(port) {
    const { stdout } = await execP(`lsof -t -i:${port}`);
    if (!stdout) return [];
    const pids = stdout.split('\n').filter(Boolean);
    if (pids.length === 0) return [];
    console.log(`  ➜ Killing PIDs on port ${port}: ${pids.join(', ')}`);
    await execP(`kill -9 ${pids.join(' ')}`);
    return pids;
}

// Find ts-node/nodemon/vite/concurrently processes whose working tree is this
// repo. We resolve repo membership by reading /proc-equivalent paths (lsof on
// the process's cwd). Falls back to substring-matching the command line.
async function findOrphansForThisRepo() {
    const orphans = new Set();

    for (const pattern of ORPHAN_PATTERNS) {
        // pgrep -f finds processes whose full command matches the pattern.
        const { stdout } = await execP(`pgrep -f ${JSON.stringify(pattern)}`);
        if (!stdout) continue;

        const pids = stdout.split('\n').filter(Boolean);
        for (const pid of pids) {
            // Skip the start-all.js process itself and its direct children we just spawned.
            if (Number(pid) === process.pid) continue;

            // Confirm the process belongs to this repo. Try two signals:
            //   1. Its cwd is inside REPO_ROOT (lsof -d cwd).
            //   2. Its command-line contains the REPO_ROOT path (typical for
            //      `node /path/to/repo/node_modules/.bin/ts-node ...`).
            // We need the OR because an orphan whose launching shell died
            // ends up with cwd=`/`, which fails signal #1 — but its command
            // line still references the repo, so signal #2 saves it.
            const { stdout: lsofOut } = await execP(`lsof -p ${pid} -d cwd -F n 2>/dev/null`);
            const cwdLine = lsofOut.split('\n').find((l) => l.startsWith('n'));
            const cwd = cwdLine ? cwdLine.slice(1) : '';

            const { stdout: cmdLine } = await execP(`ps -o command= -p ${pid} 2>/dev/null`);

            if (cwd.startsWith(REPO_ROOT) || cmdLine.includes(REPO_ROOT)) {
                orphans.add(pid);
            }
        }
    }

    return Array.from(orphans);
}

async function killOrphans() {
    const orphans = await findOrphansForThisRepo();
    if (orphans.length === 0) return;
    console.log(`  ➜ Killing repo orphans: ${orphans.join(', ')}`);
    await execP(`kill -9 ${orphans.join(' ')}`);
}

async function waitForPortFree(port, { attempts = 20, intervalMs = 250 } = {}) {
    for (let i = 0; i < attempts; i++) {
        if (!(await isPortInUse(port))) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
}

async function run() {
    console.log('Checking if development environment is already running...');

    const portStates = await Promise.all(ALL_PORTS.map((p) => isPortInUse(p)));
    const anyInUse = portStates.some(Boolean);

    // Always sweep for repo orphans — even when ports look free, a stuck
    // ts-node from a previous session can be holding sockets that lsof on the
    // port misses. This is the main fix vs the previous version.
    console.log('\nSweeping for orphaned dev processes from this repo...');
    await killOrphans();

    if (anyInUse) {
        console.log('\nClearing the three dev ports...');
        await Promise.all(ALL_PORTS.map(killByPort));
    }

    // Wait for all three ports to actually be free before launching, retrying
    // for up to 5s. macOS can hold a socket in TIME_WAIT for a few seconds
    // after kill -9 — the previous fixed 1500ms sleep wasn't always enough.
    console.log('\nWaiting for ports to settle...');
    const settled = await Promise.all(ALL_PORTS.map((p) => waitForPortFree(p)));
    const stuck = ALL_PORTS.filter((_, i) => !settled[i]);
    if (stuck.length > 0) {
        console.error(`\n❌ Ports still in use after kill + 5s wait: ${stuck.join(', ')}`);
        console.error('   Run `lsof -i:<port>` to investigate, or reboot to clear TIME_WAIT.');
        process.exit(1);
    }

    console.log('\n✓ All dev ports free. Starting services cleanly.\n');

    const child = spawn(
        'npx',
        ['concurrently', '"npm:start:service"', '"npm:start:admin"', '"npm:start:web"'],
        {
            stdio: 'inherit',
            shell: true,
        },
    );

    child.on('close', (code) => {
        process.exit(code);
    });
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
