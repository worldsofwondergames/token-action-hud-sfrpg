import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const AUTH_FILE = './e2e/.auth/state.json';
// The world and GM account the suite logs in with. Override them to run against
// another world, e.g. E2E_WORLD="Starfinder: Mechageddon" E2E_USER="Game Master".
const WORLD_TITLE = process.env.E2E_WORLD ?? 'Starfinder Test World';
const USER_NAME = process.env.E2E_USER ?? 'Gamemaster';
const STATUS_URL = 'http://localhost:30000/api/status';

/**
 * Wait until Foundry reports the world is up with no more than `maxUsers`
 * connected.
 *
 * Foundry allows ONE session per user, and it only frees the Gamemaster seat when
 * the socket disconnects -- which happens after browser.close() has already
 * returned. Without this wait the first worker races that release, fails to reach
 * game.ready, and burns its full timeout before retrying. /api/status is served
 * over plain HTTP and takes no seat of its own, so polling it is safe.
 *
 * `maxUsers` is the count seen before the suite logged in, so a person already
 * playing in the world on another account does not block the run.
 */
async function waitForFreeSeat({ maxUsers = 0, timeoutMs = 30_000, pollMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(STATUS_URL);
            last = await res.json();
            if (last.active === true && last.users <= maxUsers) return last;
        } catch (err) {
            last = { error: err.message };
        }
        await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error(
        `Foundry did not report an idle world within ${timeoutMs}ms. `
        + `Last /api/status: ${JSON.stringify(last)}. `
        + 'A leftover browser from a killed run is the usual cause.'
    );
}

export default async function globalSetup() {
    mkdirSync(dirname(AUTH_FILE), { recursive: true });

    // Whoever is connected now stays connected; the suite only needs its own
    // seat back once it is done with it.
    const status = await fetch(STATUS_URL).then(res => res.json());
    const maxUsers = status.active === true ? status.users : 0;

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:30000');
    await page.waitForLoadState('domcontentloaded');

    if (page.url().includes('/setup')) {
        await page.locator(`li:has(h3:has-text("${WORLD_TITLE}")) a[data-action="worldLaunch"]`)
            .click({ force: true });
        await page.waitForURL('**/join', { timeout: 60_000 });
    }

    await page.waitForSelector('select[name="userid"]', { timeout: 60_000 });
    await page.locator('select[name="userid"]').selectOption({ label: USER_NAME });
    await page.locator('button:has-text("Join Game Session")').click();

    await page.waitForFunction(
        () => typeof game !== 'undefined' && game.ready === true,
        null,
        { timeout: 60_000 }
    );

    // The suite only makes sense against Starfinder; anything else would fail
    // later with confusing selector errors rather than saying what is wrong.
    const systemId = await page.evaluate(() => game.system.id);
    if (systemId !== 'sfrpg') {
        await browser.close();
        throw new Error(`Expected the "sfrpg" system, but the world runs "${systemId}".`);
    }

    // Clean up leftover test actors
    await page.evaluate(async () => {
        for (const actor of game.actors.filter(a => a.name.startsWith('_E2E_'))) {
            await actor.delete();
        }
    });

    await context.storageState({ path: AUTH_FILE });
    await browser.close();

    // browser.close() returns before Foundry has processed the disconnect, so
    // hand off to the first worker only once the seat is genuinely free.
    await waitForFreeSeat({ maxUsers });
}
