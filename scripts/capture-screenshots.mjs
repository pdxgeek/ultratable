/**
 * Capture the screenshots referenced by the top-level README.
 *
 * Drives a headless instance of the user's system Chrome via puppeteer-core,
 * signs in via the dev-login endpoint, and writes PNGs to docs/screenshots/.
 *
 * Prereqs:
 *   - npm run dev (service 8080, web 5175, admin 5174 must all respond)
 *   - puppeteer-core installed somewhere on NODE_PATH:
 *       cd /tmp && npm install puppeteer-core
 *
 * Run:
 *   NODE_PATH=/tmp/node_modules node scripts/capture-screenshots.mjs
 *
 * If a new screenshot is added to docs/screenshots/README.md, add the
 * corresponding capture block here so the next refresh stays in sync.
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'docs', 'screenshots');
const WEB = 'http://localhost:5175';
const ADMIN = 'http://localhost:5174';
const GRAPHQL = 'http://localhost:8080/graphql';
const VIEWPORT = { width: 1600, height: 1000 };

// Premier League 2025 — Man City 0–2 Tottenham. Has lineups + events.
// Pick a different one by querying GraphQL: `{ fixtures(seasonId:"…"){ id … } }`.
const FEATURE_FIXTURE_ID = 'a50b2150-e972-4465-acb9-b6e6b746c595';

// Tier list to feature on ranking.png. Has hand-curated graphics overrides
// (custom coach portraits), so we pin by title rather than grabbing whichever
// list happens to be first in the index.
const TIER_LIST_TITLE = 'Best Coaches';

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: ['--hide-scrollbars', '--no-sandbox'],
});

async function newPage(origin) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    // Pre-hide the floating DevLoginTools panel (it reads '1' from sessionStorage).
    await page.evaluate(() => sessionStorage.setItem('devLoginTools.hidden', '1'));
    return page;
}

async function signIn(page, role) {
    const seed = await page.evaluate(async (role) => {
        const r = await fetch('/api/auth/dev-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role }),
        });
        return { ok: r.ok, status: r.status, text: await r.text() };
    }, role);
    if (!seed.ok) throw new Error(`dev-login failed: ${seed.status} ${seed.text}`);

    const signin = await page.evaluate(async (role) => {
        const r = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: `dev-${role}@ultratable.local`,
                password: 'dev-password-123',
            }),
        });
        return { ok: r.ok, status: r.status, text: await r.text() };
    }, role);
    if (!signin.ok) throw new Error(`sign-in failed: ${signin.status} ${signin.text}`);
}

async function settle(page, ms = 1500) {
    try {
        await page.waitForNetworkIdle({ idleTime: 700, timeout: 10000 });
    } catch {}
    await new Promise((r) => setTimeout(r, ms));
}

async function shot(page, file) {
    await page.evaluate(() => sessionStorage.setItem('devLoginTools.hidden', '1'));
    await settle(page);
    await page.screenshot({ path: `${OUT}/${file}`, type: 'png' });
    console.log(`  → ${file}`);
}

try {
    console.log('[web] public pages');
    {
        const page = await newPage(WEB);
        await page.goto(WEB, { waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'hero-standings.png');

        await page.goto(`${WEB}/login`, { waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'web-login.png');
        await page.close();
    }

    console.log('[web] authenticated pages');
    {
        const page = await newPage(WEB);
        await signIn(page, 'user');

        await page.goto(`${WEB}/predictions`, { waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'web-predictions.png');

        await page.goto(`${WEB}/account`, { waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'web-account.png');

        await page.goto(`${WEB}/match/${FEATURE_FIXTURE_ID}`, {
            waitUntil: 'networkidle2',
            timeout: 25000,
        });
        await shot(page, 'web-match-detail.png');

        // Tier-list detail: pin to "Best Coaches" — that list has hand-curated
        // graphics overrides and is the canonical shot for ranking.png.
        await page.goto(`${WEB}/tier-lists`, { waitUntil: 'networkidle2', timeout: 20000 });
        const tierListHref = await page.evaluate((title) => {
            const links = Array.from(
                document.querySelectorAll('a[href^="/tier-lists/"]'),
            );
            const match = links.find((a) => a.textContent?.trim().includes(title));
            return match?.getAttribute('href') ?? null;
        }, TIER_LIST_TITLE);
        if (tierListHref) {
            await page.goto(`${WEB}${tierListHref}`, {
                waitUntil: 'networkidle2',
                timeout: 20000,
            });
            await shot(page, 'ranking.png');
        } else {
            console.log(`  ⚠ "${TIER_LIST_TITLE}" tier list not found, skipping ranking.png`);
        }
        await page.close();
    }

    console.log('[admin] pages');
    {
        const page = await newPage(ADMIN);
        await signIn(page, 'admin');
        await page.evaluate(() => sessionStorage.setItem('devLoginTools.hidden', '1'));
        await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'admin-dashboard.png');

        // Inventory: pick England so the catalog populates with real leagues.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(
                (b) => b.textContent?.trim() === 'Inventory',
            );
            btn?.click();
        });
        await settle(page, 800);
        await page.evaluate(() => document.querySelector('[role="combobox"]')?.click());
        await settle(page, 500);
        await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('[role="option"]'));
            (options.find((o) => o.textContent?.trim() === 'England') ?? options[0])?.click();
        });
        await settle(page, 1500);
        await shot(page, 'admin-leagues.png');

        for (const { label, file } of [
            { label: 'Workers', file: 'admin-workers.png' },
            { label: 'Graphics', file: 'admin-graphics.png' },
        ]) {
            await page.evaluate((label) => {
                const btn = Array.from(document.querySelectorAll('button')).find(
                    (b) => b.textContent?.trim() === label,
                );
                btn?.click();
            }, label);
            await shot(page, file);
        }
        await page.close();
    }

    console.log('[graphql] playground');
    {
        const page = await browser.newPage();
        await page.setViewport(VIEWPORT);
        const query = encodeURIComponent(
            [
                'query Demo {',
                '  viewer { id name email roles }',
                '  leagues { id name country sourceId }',
                '  allSeasons {',
                '    id',
                '    year',
                '    leagueId',
                '    teamCount',
                '    fixtureCount',
                '    startDate',
                '    endDate',
                '    teams { id name shortName }',
                '  }',
                '  rankingFormulas { id name description logicType }',
                '}',
            ].join('\n'),
        );
        await page.goto(`${GRAPHQL}?query=${query}`, { waitUntil: 'networkidle2', timeout: 20000 });
        await shot(page, 'graphql-playground2.png');
        await page.close();
    }
} finally {
    await browser.close();
}

console.log('done.');
