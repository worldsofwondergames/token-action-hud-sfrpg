/* global canvas, Scene -- Foundry globals used inside page.evaluate callbacks */

/**
 * Helpers for driving Token Action HUD in a live world.
 *
 * These tests enable Token Action HUD in the shared test world and must put the
 * module configuration back afterwards, so every spec pairs enableTah() with
 * restoreModuleConfig() in a finally block.
 */

export const MODULE_ID = 'token-action-hud-sfrpg';
export const HUD_SELECTOR = '#token-action-hud-app';

/** Snapshot the world's module configuration so it can be restored. */
export function captureModuleConfig(page) {
    return page.evaluate(() =>
        foundry.utils.deepClone(game.settings.get('core', 'moduleConfiguration'))
    );
}

export async function restoreModuleConfig(page, config) {
    if (!config) return;
    await page.evaluate(async (cfg) => {
        await game.settings.set('core', 'moduleConfiguration', cfg);
    }, config);
}

/**
 * Enable Core, this module and socketlib, then reload.
 *
 * socketlib is not optional: Core gates registerCoreModule() on
 * isSocketlibActive() and registerHud() calls getSocket(), so without it Core
 * silently does nothing at all -- no HUD and no error.
 */
export async function enableTah(page) {
    const known = await page.evaluate(id => game.modules.has(id), MODULE_ID);
    if (!known) {
        throw new Error(
            `Foundry cannot see ${MODULE_ID}. It scans Data/modules at server `
            + 'startup, so Foundry must be restarted after the module is added.'
        );
    }

    await page.evaluate(async (id) => {
        const cfg = foundry.utils.deepClone(game.settings.get('core', 'moduleConfiguration'));
        cfg['token-action-hud-core'] = true;
        cfg[id] = true;
        cfg.socketlib = true;
        await game.settings.set('core', 'moduleConfiguration', cfg);
    }, MODULE_ID);
    await reload(page);

    const active = await page.evaluate(id => ({
        core: game.modules.get('token-action-hud-core')?.active ?? false,
        module: game.modules.get(id)?.active ?? false
    }), MODULE_ID);
    // Foundry silently declines to enable a module whose declared dependencies
    // are unmet, so assert rather than press on into a confusing timeout.
    if (!active.core || !active.module) {
        throw new Error(`Modules did not activate: ${JSON.stringify(active)}`);
    }
}

export async function reload(page) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => typeof game !== 'undefined' && game.ready === true,
        null,
        { timeout: 90_000 }
    );
}

/** Set one of this module's client settings and let the HUD rebuild. */
export async function setModuleSetting(page, key, value) {
    await page.evaluate(async ({ id, k, v }) => {
        await game.settings.set(id, k, v);
    }, { id: MODULE_ID, k: key, v: value });
}

export async function getModuleSetting(page, key) {
    return page.evaluate(({ id, k }) => game.settings.get(id, k), { id: MODULE_ID, k: key });
}

/** Build a scene holding one token per actor and view it. */
export async function buildScene(page, actorIds) {
    const ids = await page.evaluate(async (list) => {
        const previousSceneId = canvas?.scene?.id ?? null;
        const scene = await Scene.create({ name: '_E2E_TahScene', width: 2000, height: 2000 });
        let x = 500;
        for (const id of list) {
            const token = (await game.actors.get(id).getTokenDocument({ x, y: 500 })).toObject();
            await scene.createEmbeddedDocuments('Token', [token]);
            x += 400;
        }
        await scene.view();
        return { sceneId: scene.id, previousSceneId };
    }, actorIds);

    await page.waitForFunction(
        (list) => canvas?.ready === true
            && list.every(id => canvas.tokens.placeables.some(p => p.actor?.id === id)),
        actorIds,
        { timeout: 30_000 }
    );
    return ids;
}

export async function teardownScene(page, { sceneId, previousSceneId }) {
    await page.evaluate(async ({ sid, prev }) => {
        if (prev) await game.scenes.get(prev)?.view();
        if (sid) await game.scenes.get(sid)?.delete();
    }, { sid: sceneId, prev: previousSceneId });
}

/**
 * Select a token and wait for the HUD to reflect it.
 *
 * Waits on a condition rather than a delay: Core's first initialisation runs
 * DataHandler and MigrationManager setup before the HUD exists at all, which
 * takes far longer than a fixed sleep would allow for.
 */
export async function selectToken(page, actorId) {
    const name = await page.evaluate(id => game.actors.get(id).name, actorId);

    await page.evaluate((id) => {
        const token = canvas.tokens.placeables.find(p => p.actor?.id === id);
        if (!token) throw new Error(`No token on canvas for actor ${id}`);
        token.control({ releaseOthers: true });
    }, actorId);

    await page.waitForFunction(
        ({ sel, characterName }) => {
            const el = document.querySelector(sel);
            return !!el && (el.textContent || '').includes(characterName);
        },
        { sel: HUD_SELECTOR, characterName: name },
        { timeout: 60_000 }
    );
}

/** Text of the whole HUD, after forcing it to rebuild. */
export async function hudText(page) {
    await rebuildHud(page);
    return page.evaluate(sel => document.querySelector(sel)?.textContent || '', HUD_SELECTOR);
}

/** Every action label currently rendered in the HUD. */
export async function hudActions(page) {
    await rebuildHud(page);
    return page.evaluate(sel => [...document.querySelectorAll(`${sel} .tah-action`)]
        .map(a => a.textContent.trim()).filter(Boolean), HUD_SELECTOR);
}

/**
 * Action labels inside one subgroup, addressed by the nest id Core stamps on it
 * -- `<tab>_<group>`, e.g. `skills_skills`.
 *
 * Reads `.tah-button-text` rather than the whole action element, so the info
 * badge an action carries (a modifier, a PP cost) is not glued onto its label.
 */
export async function hudGroupActions(page, nestId) {
    await rebuildHud(page);
    return page.evaluate(({ sel, nest }) => {
        const group = document.querySelector(`${sel} [data-nest-id="${nest}"]`);
        if (!group) throw new Error(`No HUD subgroup with nest id "${nest}"`);
        return [...group.querySelectorAll('.tah-action .tah-button-text')]
            .map(a => a.textContent.trim())
            .filter(Boolean);
    }, { sel: HUD_SELECTOR, nest: nestId });
}

/** The info badge text on one action, addressed by its exact label. */
export async function hudActionInfo(page, label) {
    await rebuildHud(page);
    return page.evaluate(({ sel, text }) => {
        const button = [...document.querySelectorAll(`${sel} button.tah-action-button`)]
            .find(b => b.querySelector('.tah-button-text')?.textContent.trim() === text);
        if (!button) throw new Error(`No HUD action button labelled "${text}"`);
        return button.querySelector('.tah-info1')?.textContent.trim() ?? null;
    }, { sel: HUD_SELECTOR, text: label });
}

/** Whether one action, addressed by its exact label, is dimmed. */
export async function hudActionDisabled(page, label) {
    await rebuildHud(page);
    return page.evaluate(({ sel, text }) => {
        const button = [...document.querySelectorAll(`${sel} button.tah-action-button`)]
            .find(b => b.querySelector('.tah-button-text')?.textContent.trim() === text);
        if (!button) throw new Error(`No HUD action button labelled "${text}"`);
        return button.classList.contains('disabled');
    }, { sel: HUD_SELECTOR, text: label });
}

/**
 * Rebuild the HUD and wait until it has finished rendering.
 *
 * The counter is on `window` rather than on the HUD element: Core re-renders by
 * replacing the element, so anything stored in its dataset would be thrown away
 * by the very render being waited for.
 */
export async function rebuildHud(page) {
    const before = await page.evaluate(() => window.__e2eHudRenders ?? 0);

    await page.evaluate(() => {
        window.__e2eHudRenders ??= 0;
        Hooks.once('renderTokenActionHud', () => { window.__e2eHudRenders += 1; });
        game.tokenActionHud?.update?.({ type: 'hook', name: 'e2e' });
    });

    await page.waitForFunction(
        previous => (window.__e2eHudRenders ?? 0) > previous,
        before,
        { timeout: 20_000 }
    );
}

/**
 * Click an action button by its visible label.
 *
 * The match is exact on the button's own text. There is no substring or
 * starts-with fallback: "Attack" is a prefix of several mech action names, and a
 * loose match would press the wrong button and pass.
 */
export async function clickAction(page, label) {
    await page.evaluate(({ sel, text }) => {
        const textOf = el =>
            el.querySelector('.tah-button-text')?.textContent.trim() ?? el.textContent.trim();

        // The bound element is the inner button, not the .tah-action wrapper.
        const buttons = [...document.querySelectorAll(`${sel} button.tah-action-button`)];
        const matches = buttons.filter(b => textOf(b) === text);

        if (matches.length !== 1) {
            throw new Error(
                `Expected exactly one HUD action button labelled "${text}", found ${matches.length}. `
                + `Present: ${buttons.map(b => JSON.stringify(textOf(b))).join(', ')}`
            );
        }
        matches[0].click();
    }, { sel: HUD_SELECTOR, text: label });
}
