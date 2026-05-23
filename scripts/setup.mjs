#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
// UltraTable — Local Development Setup
//
// Interactive first-run script that gathers the credentials a
// fresh clone needs and writes the two env files the workspaces
// load at runtime:
//
//   • apps/service/.env  (Fastify/Drizzle/Better Auth)
//   • .env               (root — Vite proxy target for web/admin)
//
// It also (optionally) starts a local Postgres container, runs
// `npm install`, and applies Drizzle migrations so that a user
// who clones the repo can be running with one command:
//
//   npm run setup
//
// Re-running is safe: existing values in the env files become
// the default for each prompt, so you can press Enter to keep
// what's already there.
// ──────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_ENV = path.join(ROOT, 'apps/service/.env');
const ADMIN_ENV = path.join(ROOT, 'apps/admin/.env');
const WEB_ENV = path.join(ROOT, 'apps/web/.env');
const ROOT_ENV = path.join(ROOT, '.env');

const c = {
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// Hand-rolled line reader so piped stdin (CI / smoke tests) and interactive
// TTYs both work. node:readline/promises closes itself on piped-stdin EOF,
// stranding later question()s — see nodejs/node#42182.
const stdinLines = (async function* () {
    stdin.setEncoding('utf8');
    let buffer = '';
    for await (const chunk of stdin) {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
            yield buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
        }
    }
    if (buffer.length) yield buffer;
})();

async function readLine() {
    const { value, done } = await stdinLines.next();
    return done ? '' : value.replace(/\r$/, '');
}

function header(title) {
    const bar = '═'.repeat(Math.max(0, 64 - title.length));
    stdout.write(`\n${c.cyan(`══ ${title} `)}${c.cyan(bar)}\n`);
}

function paragraph(text) {
    stdout.write(`\n${text}\n`);
}

async function ask(question, { def = '', secret = false } = {}) {
    const suffix = def ? c.dim(` [${secret ? mask(def) : def}]`) : '';
    stdout.write(`${c.bold('▸')} ${question}${suffix}: `);
    const answer = (await readLine()).trim();
    return answer || def;
}

async function choose(question, options) {
    stdout.write(`\n${c.bold('▸')} ${question}\n`);
    options.forEach((opt, i) => {
        stdout.write(
            `  ${c.cyan(`${i + 1})`)} ${c.bold(opt.label)}\n     ${c.dim(opt.description)}\n`,
        );
    });
    while (true) {
        stdout.write(`Choice [1-${options.length}, default 1]: `);
        const raw = (await readLine()).trim() || '1';
        const idx = Number.parseInt(raw, 10) - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < options.length) return options[idx].value;
        stdout.write(c.red(`  Pick a number 1-${options.length}.\n`));
    }
}

async function confirm(question, def = true) {
    const hint = def ? 'Y/n' : 'y/N';
    stdout.write(`${c.bold('▸')} ${question} [${hint}]: `);
    const ans = (await readLine()).trim().toLowerCase();
    if (!ans) return def;
    return ans.startsWith('y');
}

function mask(value) {
    if (!value) return '';
    if (value.length <= 8) return '•'.repeat(value.length);
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function which(cmd) {
    const result = spawnSync('which', [cmd], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
}

function run(cmd, args, opts = {}) {
    stdout.write(c.dim(`  $ ${cmd} ${args.join(' ')}\n`));
    const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
    return result.status === 0;
}

function parseEnvFile(filePath) {
    const env = {};
    if (!existsSync(filePath)) return env;
    const text = readFileSync(filePath, 'utf8');
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    return env;
}

function buildServiceEnv(vars) {
    return `# Generated by scripts/setup.mjs — safe to edit by hand.
# Re-run \`npm run setup\` to regenerate; existing values become defaults.

# ── Core ─────────────────────────────────────────────────────
NODE_ENV=${vars.NODE_ENV}
HOST=${vars.HOST}
PORT=${vars.PORT}
LOG_LEVEL=${vars.LOG_LEVEL}

# ── Database ────────────────────────────────────────────────
# DB_MODE selects the runtime mode (supabase | docker | system). Read by
# apps/service/src/config/runtime-mode.ts to decide which storage backend
# to use and whether to construct the Supabase SDK client.
DB_MODE=${vars.DB_MODE}
DATABASE_URL=${vars.DATABASE_URL}

# ── Supabase (storage / SDK) ─────────────────────────────────
# Only consulted when DB_MODE=supabase. Leave blank otherwise.
SUPABASE_URL=${vars.SUPABASE_URL}
SUPABASE_ANON_KEY=${vars.SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${vars.SUPABASE_SERVICE_ROLE_KEY}

# ── S3 / MinIO (blob storage) ────────────────────────────────
# Used when DB_MODE=docker (local MinIO via docker-compose). Any
# S3-compatible endpoint works — point S3_ENDPOINT at AWS S3, R2,
# Backblaze B2, etc. and the same provider talks to it. Leave
# blank for DB_MODE=system to disable graphics uploads.
S3_ENDPOINT=${vars.S3_ENDPOINT}
S3_REGION=${vars.S3_REGION}
S3_ACCESS_KEY=${vars.S3_ACCESS_KEY}
S3_SECRET_KEY=${vars.S3_SECRET_KEY}
S3_BUCKET=${vars.S3_BUCKET}
S3_PUBLIC_URL=${vars.S3_PUBLIC_URL}

# ── Football Data Provider ───────────────────────────────────
# Sign up at https://www.api-football.com/. Required to load any
# real fixture / team / player data; leave blank to start the
# service in “no upstream” mode for UI work.
API_FOOTBALL_KEY=${vars.API_FOOTBALL_KEY}

# ── Authentication (Better Auth) ─────────────────────────────
BETTER_AUTH_SECRET=${vars.BETTER_AUTH_SECRET}
BETTER_AUTH_URL=${vars.BETTER_AUTH_URL}

# ── Google OAuth (optional, per-frontend) ────────────────────
# Each frontend has its own OAuth client (same Google Cloud project).
# The PUBLIC client_id lives in each frontend's .env as VITE_GOOGLE_CLIENT_ID;
# the SECRET stays here, server-side. See apps/service/.env.example for the
# full model and the known per-host-dispatch follow-up.
GOOGLE_CLIENT_ID_ADMIN=${vars.GOOGLE_CLIENT_ID_ADMIN}
GOOGLE_CLIENT_SECRET_ADMIN=${vars.GOOGLE_CLIENT_SECRET_ADMIN}
GOOGLE_CLIENT_ID_WEB=${vars.GOOGLE_CLIENT_ID_WEB}
GOOGLE_CLIENT_SECRET_WEB=${vars.GOOGLE_CLIENT_SECRET_WEB}
`;
}

function buildAdminEnv(vars) {
    return `# Generated by scripts/setup.mjs — Vite env for apps/admin.
# Public values only (VITE_*) — anything in here ends up in the browser bundle.
# Re-run \`npm run setup\` to regenerate; existing values become defaults.

VITE_GOOGLE_CLIENT_ID=${vars.GOOGLE_CLIENT_ID_ADMIN}
`;
}

function buildWebEnv(vars) {
    return `# Generated by scripts/setup.mjs — Vite env for apps/web.
# Public values only (VITE_*) — anything in here ends up in the browser bundle.
# Re-run \`npm run setup\` to regenerate; existing values become defaults.

VITE_GOOGLE_CLIENT_ID=${vars.GOOGLE_CLIENT_ID_WEB}
`;
}

function buildRootEnv(target) {
    return `# Generated by scripts/setup.mjs — Vite proxy target for /apps/web and /apps/admin.
VITE_API_TARGET=${target}
`;
}

async function main() {
    stdout.write(c.bold('\n🏟  UltraTable — Local Development Setup\n'));
    paragraph(
        `This script gathers the credentials a fresh clone needs and writes:\n` +
            `  • ${c.cyan('apps/service/.env')} — Fastify, Drizzle, Better Auth\n` +
            `  • ${c.cyan('.env')} (root)        — Vite proxy target for web/admin\n\n` +
            `It is safe to re-run. Existing values become defaults; just press Enter to keep them.`,
    );

    // ── Prereq check ─────────────────────────────────────────
    header('Prerequisite check');
    const node = process.version;
    const npm = which('npm');
    const docker = which('docker');
    const volta = which('volta');
    stdout.write(`  Node:   ${c.green(node)}\n`);
    stdout.write(`  npm:    ${npm ? c.green(npm) : c.red('not found')}\n`);
    stdout.write(
        `  Volta:  ${volta ? c.green(volta) : c.yellow('not found — install from https://volta.sh to auto-match the pinned Node/npm in package.json')}\n`,
    );
    stdout.write(
        `  Docker: ${docker ? c.green(docker) : c.yellow('not found (only needed for db-mode=docker)')}\n`,
    );
    if (!npm) {
        stdout.write(
            c.red('\nnpm is required. Install Node.js (we recommend Volta) and re-run.\n'),
        );
        process.exit(1);
    }

    // ── Load existing env as defaults ────────────────────────
    const existing = parseEnvFile(SERVICE_ENV);
    const rootExisting = parseEnvFile(ROOT_ENV);

    // ── Database mode ────────────────────────────────────────
    header('Database');
    paragraph(
        `Supabase config IS Postgres config — picking Supabase means a hosted Postgres\n` +
            `with the storage SDK enabled. Picking local Docker / system Postgres means the\n` +
            `service connects to plain Postgres and the Supabase storage features are off.`,
    );

    const inferredMode = existing.DB_MODE
        ? existing.DB_MODE
        : existing.SUPABASE_URL
          ? 'supabase'
          : existing.DATABASE_URL?.includes('localhost')
            ? 'docker'
            : existing.DATABASE_URL
              ? 'system'
              : 'docker';

    const dbMode = await choose(
        `How do you want to run Postgres? (current: ${c.cyan(inferredMode)})`,
        [
            {
                value: 'docker',
                label: 'Local Postgres via Docker Compose',
                description:
                    'Spins up a postgres:16-alpine container on :5432. Requires Docker. Storage features are disabled.',
            },
            {
                value: 'supabase',
                label: 'Supabase project',
                description:
                    'Use a hosted Supabase project. Provides Postgres + storage. Bring your own URL + keys.',
            },
            {
                value: 'system',
                label: 'I already have Postgres running',
                description:
                    'You provide the DATABASE_URL. Storage features are disabled unless you also supply Supabase keys.',
            },
        ],
    );

    const vars = {
        NODE_ENV: existing.NODE_ENV || 'development',
        HOST: existing.HOST || '0.0.0.0',
        PORT: existing.PORT || '8080',
        LOG_LEVEL: existing.LOG_LEVEL || 'debug',
        DB_MODE: dbMode,
        DATABASE_URL: '',
        SUPABASE_URL: '',
        SUPABASE_ANON_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        S3_ENDPOINT: existing.S3_ENDPOINT || '',
        S3_REGION: existing.S3_REGION || '',
        S3_ACCESS_KEY: existing.S3_ACCESS_KEY || '',
        S3_SECRET_KEY: existing.S3_SECRET_KEY || '',
        S3_BUCKET: existing.S3_BUCKET || '',
        S3_PUBLIC_URL: existing.S3_PUBLIC_URL || '',
        API_FOOTBALL_KEY: '',
        BETTER_AUTH_SECRET: existing.BETTER_AUTH_SECRET || randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: existing.BETTER_AUTH_URL || 'http://localhost:5174',
        // Old single-client env vars (GOOGLE_CLIENT_ID/SECRET) are migrated
        // into the admin slot on first re-run; the user can split them later.
        GOOGLE_CLIENT_ID_ADMIN:
            existing.GOOGLE_CLIENT_ID_ADMIN || existing.GOOGLE_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET_ADMIN:
            existing.GOOGLE_CLIENT_SECRET_ADMIN || existing.GOOGLE_CLIENT_SECRET || '',
        GOOGLE_CLIENT_ID_WEB: existing.GOOGLE_CLIENT_ID_WEB || '',
        GOOGLE_CLIENT_SECRET_WEB: existing.GOOGLE_CLIENT_SECRET_WEB || '',
    };

    if (dbMode === 'supabase') {
        paragraph(
            `Find these in your Supabase project under Settings → API and Settings → Database.\n` +
                `The service role key is a secret — it bypasses RLS and is only used server-side.`,
        );
        vars.SUPABASE_URL = await ask('Supabase project URL (https://xxx.supabase.co)', {
            def: existing.SUPABASE_URL,
        });
        vars.SUPABASE_ANON_KEY = await ask('Supabase anon / publishable key', {
            def: existing.SUPABASE_ANON_KEY,
            secret: true,
        });
        vars.SUPABASE_SERVICE_ROLE_KEY = await ask('Supabase service role key', {
            def: existing.SUPABASE_SERVICE_ROLE_KEY,
            secret: true,
        });
        vars.DATABASE_URL = await ask('DATABASE_URL (Supabase connection string)', {
            def: existing.DATABASE_URL,
            secret: true,
        });
    } else if (dbMode === 'docker') {
        if (!docker) {
            stdout.write(
                c.red(
                    '  Docker is not installed — pick a different mode or install Docker first.\n',
                ),
            );
            process.exit(1);
        }
        vars.DATABASE_URL = await ask('DATABASE_URL', {
            def: existing.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
        });
        // Default S3 vars target the MinIO container in docker-compose.yml.
        // Operator can edit .env to point at a different S3-compatible endpoint.
        vars.S3_ENDPOINT = existing.S3_ENDPOINT || 'http://localhost:9000';
        vars.S3_REGION = existing.S3_REGION || 'us-east-1';
        vars.S3_ACCESS_KEY = existing.S3_ACCESS_KEY || 'root';
        vars.S3_SECRET_KEY = existing.S3_SECRET_KEY || 'root12345';
        vars.S3_BUCKET = existing.S3_BUCKET || 'graphics';
        vars.S3_PUBLIC_URL = existing.S3_PUBLIC_URL || 'http://localhost:9000';
        // Supabase keys intentionally left blank.
    } else {
        vars.DATABASE_URL = await ask('DATABASE_URL', { def: existing.DATABASE_URL, secret: true });
        if (
            await confirm(
                'Also configure Supabase keys for storage features?',
                Boolean(existing.SUPABASE_URL),
            )
        ) {
            vars.SUPABASE_URL = await ask('Supabase project URL', { def: existing.SUPABASE_URL });
            vars.SUPABASE_ANON_KEY = await ask('Supabase anon key', {
                def: existing.SUPABASE_ANON_KEY,
                secret: true,
            });
            vars.SUPABASE_SERVICE_ROLE_KEY = await ask('Supabase service role key', {
                def: existing.SUPABASE_SERVICE_ROLE_KEY,
                secret: true,
            });
        }
    }

    // ── API-Football ─────────────────────────────────────────
    header('Football data provider');
    paragraph(
        `API-Football (https://www.api-football.com/) is the upstream for fixtures,\n` +
            `teams, players, and standings. Leave blank to start the service without\n` +
            `upstream data — useful for UI work, but every catalog/import call will 401.`,
    );
    vars.API_FOOTBALL_KEY = await ask('API_FOOTBALL_KEY (blank to skip)', {
        def: existing.API_FOOTBALL_KEY,
        secret: true,
    });
    if (!vars.API_FOOTBALL_KEY) {
        stdout.write(
            c.yellow(
                '  ⚠  No API-Football key — sport-data endpoints will fail until you add one.\n',
            ),
        );
    }

    // ── Auth ─────────────────────────────────────────────────
    header('Authentication');
    if (existing.BETTER_AUTH_SECRET) {
        stdout.write(
            `  Reusing existing BETTER_AUTH_SECRET (${mask(existing.BETTER_AUTH_SECRET)}).\n`,
        );
    } else {
        stdout.write(`  Generated a new BETTER_AUTH_SECRET (32 random bytes, hex-encoded).\n`);
    }
    vars.BETTER_AUTH_URL = await ask('BETTER_AUTH_URL', { def: vars.BETTER_AUTH_URL });

    // ── Google OAuth (per-frontend) ──────────────────────────
    paragraph(
        `Optional. Each frontend (admin, web) has its own Google OAuth client\n` +
            `(same project, different consent screens + redirect URIs). Register\n` +
            `two Web OAuth clients at\n` +
            `${c.cyan('https://console.cloud.google.com/apis/credentials')}.\n\n` +
            `Authorized redirect URIs (one per client):\n` +
            `  • Admin:  http://localhost:5174/api/auth/callback/google\n` +
            `  • Web:    http://localhost:5175/api/auth/callback/google\n\n` +
            `The PUBLIC client IDs go into apps/admin/.env and apps/web/.env;\n` +
            `the SECRETS stay in apps/service/.env. Leave blank to skip Google\n` +
            `sign-in (email/password still works).`,
    );
    header('Google OAuth — Admin client');
    vars.GOOGLE_CLIENT_ID_ADMIN = await ask('Admin GOOGLE_CLIENT_ID (blank to skip)', {
        def: existing.GOOGLE_CLIENT_ID_ADMIN,
    });
    if (vars.GOOGLE_CLIENT_ID_ADMIN) {
        vars.GOOGLE_CLIENT_SECRET_ADMIN = await ask('Admin GOOGLE_CLIENT_SECRET', {
            def: existing.GOOGLE_CLIENT_SECRET_ADMIN,
            secret: true,
        });
    } else {
        vars.GOOGLE_CLIENT_SECRET_ADMIN = '';
    }

    header('Google OAuth — Web client');
    vars.GOOGLE_CLIENT_ID_WEB = await ask('Web GOOGLE_CLIENT_ID (blank to skip)', {
        def: existing.GOOGLE_CLIENT_ID_WEB,
    });
    if (vars.GOOGLE_CLIENT_ID_WEB) {
        vars.GOOGLE_CLIENT_SECRET_WEB = await ask('Web GOOGLE_CLIENT_SECRET', {
            def: existing.GOOGLE_CLIENT_SECRET_WEB,
            secret: true,
        });
    } else {
        vars.GOOGLE_CLIENT_SECRET_WEB = '';
    }

    // ── Write service .env ───────────────────────────────────
    header('Writing env files');
    if (existsSync(SERVICE_ENV)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${SERVICE_ENV}.backup.${stamp}`;
        copyFileSync(SERVICE_ENV, backupPath);
        stdout.write(
            c.dim(`  Backed up existing apps/service/.env → ${path.relative(ROOT, backupPath)}\n`),
        );
    }
    writeFileSync(SERVICE_ENV, buildServiceEnv(vars), { mode: 0o600 });
    stdout.write(c.green(`  ✓ Wrote ${SERVICE_ENV}\n`));

    // Per-frontend .env files — only VITE_* vars (bundled into the browser).
    // Always overwritten because the values are derived from the prompts above.
    writeFileSync(ADMIN_ENV, buildAdminEnv(vars), { mode: 0o644 });
    stdout.write(c.green(`  ✓ Wrote ${ADMIN_ENV}\n`));
    writeFileSync(WEB_ENV, buildWebEnv(vars), { mode: 0o644 });
    stdout.write(c.green(`  ✓ Wrote ${WEB_ENV}\n`));

    const rootTarget = rootExisting.VITE_API_TARGET || `http://127.0.0.1:${vars.PORT}`;
    if (!existsSync(ROOT_ENV)) {
        writeFileSync(ROOT_ENV, buildRootEnv(rootTarget), { mode: 0o644 });
        stdout.write(c.green(`  ✓ Wrote ${ROOT_ENV}\n`));
    } else {
        stdout.write(c.dim(`  ${ROOT_ENV} already exists — leaving it alone.\n`));
    }

    // ── Optional: docker postgres up ─────────────────────────
    if (dbMode === 'docker') {
        header('Postgres container');
        if (
            await confirm(
                'Start the local Postgres container now (docker compose up -d postgres)?',
                true,
            )
        ) {
            if (!run('docker', ['compose', 'up', '-d', 'postgres'])) {
                stdout.write(
                    c.red('  docker compose up failed — fix the error above and re-run.\n'),
                );
            } else {
                stdout.write(c.green('  ✓ Postgres container is up on localhost:5432\n'));
            }
        }

        header('MinIO container');
        paragraph(
            `MinIO is the local S3-compatible blob store used for graphics in DB_MODE=docker.\n` +
                `S3 API on :9000, web console on :9001 (root / root12345).\n` +
                `The service auto-creates the bucket and sets a public-read policy on first call.`,
        );
        if (
            await confirm('Start the local MinIO container now (docker compose up -d minio)?', true)
        ) {
            if (!run('docker', ['compose', 'up', '-d', 'minio'])) {
                stdout.write(
                    c.red('  docker compose up failed — fix the error above and re-run.\n'),
                );
            } else {
                stdout.write(
                    c.green('  ✓ MinIO container is up on localhost:9000 (console on :9001)\n'),
                );
            }
        }
    }

    // ── Optional: npm install ────────────────────────────────
    header('Dependencies');
    const nodeModulesExists = existsSync(path.join(ROOT, 'node_modules'));
    if (
        await confirm(
            `Run \`npm install\` at the workspace root${nodeModulesExists ? ' (already present — re-install)' : ''}?`,
            !nodeModulesExists,
        )
    ) {
        if (!run('npm', ['install'])) {
            stdout.write(c.red('  npm install failed — fix the error above and re-run.\n'));
        }
    }

    // ── Optional: migrations ─────────────────────────────────
    header('Database migrations');
    paragraph(
        `Applies the Drizzle migrations under apps/service/drizzle/ to the database\n` +
            `at DATABASE_URL. Two steps:\n\n` +
            `  1. ${c.bold('db:bootstrap')} — stamps drizzle.__drizzle_migrations on a DB\n` +
            `                 that was bootstrapped via \`drizzle-kit push\`. Idempotent:\n` +
            `                 no-op once the table has rows.\n` +
            `  2. ${c.bold('db:migrate')}   — applies any new migration files. Safe to re-run.`,
    );
    if (
        await confirm('Run `npm run db:bootstrap && npm run db:migrate` in apps/service now?', true)
    ) {
        const serviceCwd = path.join(ROOT, 'apps/service');
        if (!run('npm', ['run', 'db:bootstrap'], { cwd: serviceCwd })) {
            stdout.write(
                c.red(
                    '  Bootstrap failed — check that Postgres is reachable and re-run `npm run db:bootstrap --prefix apps/service`.\n',
                ),
            );
        } else if (!run('npm', ['run', 'db:migrate'], { cwd: serviceCwd })) {
            stdout.write(
                c.red(
                    '  Migrate failed — fix the error above and re-run `npm run db:migrate --prefix apps/service`.\n',
                ),
            );
        } else {
            stdout.write(c.green('  ✓ Migrations applied\n'));
        }
    }

    // ── Done ─────────────────────────────────────────────────
    header('Done');
    stdout.write(
        `${c.green('You are ready to go.')}\n\n` +
            `  Start everything:   ${c.bold('npm run dev')}\n` +
            `  Health check:       ${c.bold('npm run health:check')}\n\n` +
            `  GraphQL playground: ${c.cyan('http://localhost:8080/graphql')}\n` +
            `  Admin UI:           ${c.cyan('http://localhost:5174')}\n` +
            `  Web UI:             ${c.cyan('http://localhost:5175')}\n\n` +
            `Re-run ${c.bold('npm run setup')} any time to change credentials.\n`,
    );

    stdin.unref?.();
}

main().catch((err) => {
    stdout.write(c.red(`\nSetup failed: ${err.stack || err.message}\n`));
    stdin.unref?.();
    process.exit(1);
});
