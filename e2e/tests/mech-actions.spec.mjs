import { test, expect } from '../fixtures/foundry-test.mjs';
import {
    actorValue,
    addMechAuxiliary,
    addMechWeapon,
    createMech,
    deleteActor,
    prefixName,
    setActorValue
} from '../fixtures/test-data.mjs';
import {
    buildScene,
    captureModuleConfig,
    clickAction,
    enableTah,
    hudActionDisabled,
    hudGroupActions,
    reload,
    restoreModuleConfig,
    selectToken,
    teardownScene
} from '../fixtures/tah.mjs';

/** Localized name of one entry in a CONFIG.SFRPG mech action table. */
function mechActionName(page, table, index) {
    return page.evaluate(({ t, i }) =>
        game.i18n.localize(CONFIG.SFRPG[t][i].name), { t: table, i: index });
}

function mechActionCost(page, index) {
    return page.evaluate(i => CONFIG.SFRPG.mechPPActions[i].ppCost, index);
}

/** Index of the Power Point action that arms a damage level override. */
function armingActionIndex(page) {
    return page.evaluate(() =>
        CONFIG.SFRPG.mechPPActions.findIndex(action => !!action.armsOverride));
}

/**
 * A Power Point action spends the mech's Power Points. The cost is read from the
 * system's own table rather than written into the test, so the assertion follows
 * a rebalance instead of breaking on one.
 */
test('A Power Point action deducts its cost from the mech', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createMech(page, prefixName('PPMech'), { pp: 5 });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        const label = await mechActionName(page, 'mechPPActions', 0);
        const cost = await mechActionCost(page, 0);
        const before = await actorValue(page, actorId, 'system.attributes.pp.value');
        expect(before).toBeGreaterThanOrEqual(cost);

        await clickAction(page, label);
        await page.waitForFunction(
            ({ id, expected }) => game.actors.get(id).system.attributes.pp.value === expected,
            { id: actorId, expected: before - cost },
            { timeout: 10_000 }
        );
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/**
 * With too few Power Points the action is dimmed, and pressing it anyway leaves
 * the mech's Power Points where they were -- the actor refuses it rather than
 * going negative.
 */
test('A Power Point action the mech cannot afford is dimmed and spends nothing', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        const index = await armingActionIndex(page);
        expect(index).toBeGreaterThanOrEqual(0);
        const cost = await mechActionCost(page, index);

        actorId = await createMech(page, prefixName('BrokeMech'), { pp: cost });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        const label = await mechActionName(page, 'mechPPActions', index);

        // Affordable first: this proves the dimming below is a state the HUD
        // decides, not the only state it ever renders.
        expect(await hudActionDisabled(page, label)).toBe(false);

        await setActorValue(page, actorId, 'system.attributes.pp.value', cost - 1);
        expect(await hudActionDisabled(page, label)).toBe(true);

        await clickAction(page, label);
        // The refusal is a notification, not a document write, so wait for one to
        // appear rather than for a value that is supposed to stay put.
        await page.waitForFunction(
            () => document.querySelectorAll('#notifications .notification, .notification').length > 0,
            null,
            { timeout: 10_000 }
        );
        expect(await actorValue(page, actorId, 'system.attributes.pp.value')).toBe(cost - 1);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/**
 * Devastating Hit is declared before damage is rolled, so it arms an override
 * the next mech damage roll consumes. Until then the Utility tab offers a way to
 * take it back, which refunds what it cost.
 */
test('An armed damage override can be cancelled from the HUD and refunds its cost', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        const index = await armingActionIndex(page);
        const cost = await mechActionCost(page, index);

        actorId = await createMech(page, prefixName('OverrideMech'), { pp: cost + 2 });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        const label = await mechActionName(page, 'mechPPActions', index);
        const startingPP = await actorValue(page, actorId, 'system.attributes.pp.value');

        // Nothing is armed yet, so no cancel action exists.
        expect(await hudGroupActions(page, 'utility_utility')).not.toContain(
            await cancelLabel(page, label)
        );

        await clickAction(page, label);
        await page.waitForFunction(
            id => !!game.actors.get(id).getFlag('sfrpg', 'damageLevelOverride'),
            actorId,
            { timeout: 10_000 }
        );

        const cancel = await cancelLabel(page, label);
        expect(await hudGroupActions(page, 'utility_utility')).toContain(cancel);

        await clickAction(page, cancel);
        await page.waitForFunction(
            id => !game.actors.get(id).getFlag('sfrpg', 'damageLevelOverride'),
            actorId,
            { timeout: 10_000 }
        );
        expect(await actorValue(page, actorId, 'system.attributes.pp.value')).toBe(startingPP);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/** Mech weapons and gear actions reach their own tabs. */
test('Mech weapons and gear actions appear in their tabs', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createMech(page, prefixName('LoadedMech'), { pp: 5 });
        await addMechWeapon(page, actorId, { name: prefixName('Autocannon') });
        await addMechAuxiliary(page, actorId, {
            name: prefixName('Sensor Suite'),
            action: { name: 'Deep Scan', description: 'Scan the area.', actionType: 'move', ppCost: null }
        });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        expect(await hudGroupActions(page, 'mechWeapons_mechWeaponAttacks'))
            .toEqual([prefixName('Autocannon')]);
        expect(await hudGroupActions(page, 'mechWeapons_mechWeaponDamage'))
            .toEqual([prefixName('Autocannon')]);
        expect(await hudGroupActions(page, 'mechSystems_mechAuxiliary'))
            .toEqual([prefixName('Sensor Suite')]);
        expect(await hudGroupActions(page, 'mechActions_mechGearActions'))
            .toEqual([`Deep Scan (${prefixName('Sensor Suite')})`]);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/** The cancel action names the override's source, which is the action that armed it. */
function cancelLabel(page, source) {
    return page.evaluate(
        s => game.i18n.format('tokenActionHud.sfrpg.cancelOverride', { source: s }),
        source
    );
}
