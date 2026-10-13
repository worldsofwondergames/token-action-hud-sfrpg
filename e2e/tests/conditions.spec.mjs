/* global canvas -- Foundry global used inside page.evaluate callbacks */
import { test, expect } from '../fixtures/foundry-test.mjs';
import { createNpc, deleteActor, prefixName } from '../fixtures/test-data.mjs';
import {
    buildScene,
    captureModuleConfig,
    clickAction,
    enableTah,
    hudActionActive,
    hudGroupActions,
    reload,
    restoreModuleConfig,
    selectToken,
    teardownScene
} from '../fixtures/tah.mjs';

const GROUP = 'conditions_conditions';

/**
 * Run `body` with Token Action HUD on and one NPC token selected, and put the
 * world back afterwards whatever happens.
 */
async function withNpc(page, name, body) {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);
        actorId = await createNpc(page, prefixName(name));
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);
        await body(actorId);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
}

/** The label the system gives a condition. */
function conditionLabel(page, id) {
    return page.evaluate(key => game.i18n.localize(CONFIG.SFRPG.conditionTypes[key]), id);
}

/**
 * The tab lists the conditions the token HUD offers. The expected list is read
 * from the system's status effects, so it follows whatever the system defines.
 */
test('Conditions tab lists the token HUD conditions and marks the active ones', async ({ page }) => {
    await withNpc(page, 'CondListNpc', async (actorId) => {
        await page.evaluate(id => game.actors.get(id).setCondition('shaken', true), actorId);

        const expected = await page.evaluate(() => CONFIG.SFRPG.statusEffects
            .filter(e => e.hud !== false && CONFIG.SFRPG.conditionTypes[e.id])
            .map(e => game.i18n.localize(CONFIG.SFRPG.conditionTypes[e.id]))
            .sort((a, b) => a.localeCompare(b)));
        expect(expected).toContain(await conditionLabel(page, 'corrode'));
        expect(await hudGroupActions(page, GROUP)).toEqual(expected);

        expect(await hudActionActive(page, await conditionLabel(page, 'shaken'))).toBe(true);
        expect(await hudActionActive(page, await conditionLabel(page, 'asleep'))).toBe(false);
    });
});

test('Clicking a condition switches it on and off', async ({ page }) => {
    await withNpc(page, 'CondToggleNpc', async (actorId) => {
        const shaken = await conditionLabel(page, 'shaken');
        // The HUD acts on the selected token's own actor. The test NPC's token is
        // unlinked, so the condition goes on the token's copy, not the world actor.
        const has = () => page.evaluate(id => canvas.tokens.placeables
            .find(t => t.document.actorId === id).actor.hasCondition('shaken'), actorId);

        expect(await has()).toBe(false);
        await clickAction(page, shaken, { group: GROUP });
        await expect.poll(has).toBe(true);
        expect(await hudActionActive(page, shaken)).toBe(true);

        await clickAction(page, shaken, { group: GROUP });
        await expect.poll(has).toBe(false);
        expect(await hudActionActive(page, shaken)).toBe(false);
    });
});

/**
 * Corrode deals damage each turn, so switching it on asks how much, the same
 * prompt the token HUD shows, and the answer becomes the condition's turn event.
 */
test('Clicking an ongoing damage condition asks for its amount', async ({ page }) => {
    await withNpc(page, 'CondCorrodeNpc', async (actorId) => {
        await clickAction(page, await conditionLabel(page, 'corrode'), { group: GROUP });

        const dialog = page.locator('.application').filter({ has: page.locator('input[name=formula]') }).last();
        await expect(dialog.locator('input[name=formula]')).toHaveValue('1d6');
        await dialog.locator('input[name=formula]').fill('2d4');
        await dialog.getByRole('button', { name: 'Apply' }).click();

        await expect.poll(() => page.evaluate(id => {
            const actor = canvas.tokens.placeables.find(t => t.document.actorId === id).actor;
            const item = actor.getCondition('corrode');
            return item?.system.turnEvents?.map(e => ({ formula: e.formula, types: e.damageTypes, trigger: e.trigger })) ?? null;
        }, actorId)).toEqual([{ formula: '2d4', types: { acid: true }, trigger: 'onTurnStart' }]);
    });
});
