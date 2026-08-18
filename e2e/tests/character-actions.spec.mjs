import { test, expect } from '../fixtures/foundry-test.mjs';
import {
    addSpell,
    addWeapon,
    createCharacter,
    deleteActor,
    prefixName,
    setActorValue
} from '../fixtures/test-data.mjs';
import {
    buildScene,
    captureModuleConfig,
    clickAction,
    enableTah,
    hudActionInfo,
    hudGroupActions,
    reload,
    restoreModuleConfig,
    selectToken,
    setModuleSetting,
    teardownScene
} from '../fixtures/tah.mjs';
import { chatMessageCount, setQuickRoll, waitForChatMessage } from '../fixtures/sfrpg.mjs';

/**
 * The Skills tab is bound to the actor's own skill ranks, and the setting
 * decides whether the untrained ones join them. Both sides are read from live
 * data rather than compared against a fixed list, so a skill renamed in the
 * system does not turn this into a false failure -- and a HUD that listed the
 * wrong skills still fails.
 */
test('Skills tab lists the actor\'s trained skills, and the setting adds the rest', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createCharacter(page, prefixName('SkillChar'), {
            abilities: { dex: 16, int: 14 },
            skills: { acr: 3, com: 2 }
        });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        const labelsFor = ids => page.evaluate(
            list => list.map(id => game.i18n.localize(CONFIG.SFRPG.skills[id.substring(0, 3)])),
            ids
        );

        await setModuleSetting(page, 'showUntrainedSkills', false);
        const trainedIds = await page.evaluate(id => Object.entries(game.actors.get(id).system.skills)
            .filter(([, skill]) => (skill.ranks ?? 0) > 0)
            .map(([key]) => key), actorId);

        expect(trainedIds.length).toBeGreaterThan(0);
        expect(await hudGroupActions(page, 'skills_skills'))
            .toEqual(expect.arrayContaining(await labelsFor(trainedIds)));
        expect(await hudGroupActions(page, 'skills_skills')).toHaveLength(trainedIds.length);

        // The modifier shown is the actor's own, not a value the HUD computed.
        const acrobaticsLabel = (await labelsFor(['acr']))[0];
        const acrobaticsMod = await page.evaluate(
            id => game.actors.get(id).system.skills.acr.mod, actorId);
        expect(await hudActionInfo(page, acrobaticsLabel))
            .toBe(acrobaticsMod < 0 ? String(acrobaticsMod) : `+${acrobaticsMod}`);

        await setModuleSetting(page, 'showUntrainedSkills', true);
        const allIds = await page.evaluate(
            id => Object.keys(game.actors.get(id).system.skills), actorId);

        expect(allIds.length).toBeGreaterThan(trainedIds.length);
        expect(await hudGroupActions(page, 'skills_skills')).toHaveLength(allIds.length);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/**
 * A weapon the character is not holding cannot be fired, and the sheet offers no
 * attack button for one. Equipping it is what makes the action exist.
 */
test('Attack tab follows whether the weapon is equipped', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createCharacter(page, prefixName('ArmedChar'), { abilities: { dex: 16 } });
        const weaponId = await addWeapon(page, actorId, {
            name: prefixName('Pistol'),
            equipped: false
        });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        expect(await hudGroupActions(page, 'attack_weaponAttacks')).toEqual([]);

        await page.evaluate(async ({ id, item }) => {
            await game.actors.get(id).items.get(item).update({ 'system.equipped': true });
        }, { id: actorId, item: weaponId });

        const weaponName = await page.evaluate(({ id, item }) =>
            game.actors.get(id).items.get(item).name, { id: actorId, item: weaponId });

        expect(await hudGroupActions(page, 'attack_weaponAttacks')).toEqual([weaponName]);
        expect(await hudGroupActions(page, 'attack_weaponDamage')).toEqual([weaponName]);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/**
 * Clicking an ability, a save and a weapon attack each has to reach the
 * system's own roll, not a roll this module built. A rolled chat message is the
 * evidence that it did.
 */
test('Clicking an ability, a save and an attack each produces a roll', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;
    let previousQuickRoll;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);
        // Skip the roll configuration dialog so the click lands in chat directly.
        previousQuickRoll = await setQuickRoll(page, true);

        actorId = await createCharacter(page, prefixName('RollChar'), {
            abilities: { str: 18, dex: 14 }
        });
        await addWeapon(page, actorId, { name: prefixName('Rifle'), equipped: true });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        const fortLabel = await page.evaluate(() => game.i18n.localize(CONFIG.SFRPG.saves.fort));
        const rifleName = prefixName('Rifle');

        for (const label of ['STR', fortLabel, rifleName]) {
            const before = await chatMessageCount(page);
            await clickAction(page, label);
            const message = await waitForChatMessage(page, before);
            expect(message.rollCount).toBeGreaterThan(0);
        }
    } finally {
        if (previousQuickRoll !== undefined) await setQuickRoll(page, previousQuickRoll);
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});

/**
 * Spell levels are separate groups, and each carries the slots remaining for
 * that level -- read from the actor, so spending a slot moves the badge.
 */
test('Spells are grouped by level and the group shows the actor\'s remaining slots', async ({ page }) => {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createCharacter(page, prefixName('CasterChar'), {
            abilities: { cha: 16 },
            spellSlots: { 1: 4 }
        });
        await addSpell(page, actorId, { name: prefixName('Magic Missile'), level: 1 });
        await addSpell(page, actorId, { name: prefixName('Overheat'), level: 2 });
        scene = await buildScene(page, [actorId]);
        await selectToken(page, actorId);

        expect(await hudGroupActions(page, 'spells_spells1')).toEqual([prefixName('Magic Missile')]);
        expect(await hudGroupActions(page, 'spells_spells2')).toEqual([prefixName('Overheat')]);

        const slotBadge = () => page.evaluate(() => {
            const group = document.querySelector('#token-action-hud-app [data-nest-id="spells_spells1"]');
            if (!group) throw new Error('No level 1 spell group in the HUD');
            return group.querySelector('.tah-list-subgroup-title .tah-info1')?.textContent.trim() ?? null;
        });

        const before = await page.evaluate(
            id => game.actors.get(id).system.spells.spell1.value, actorId);
        expect(await slotBadge()).toBe(`${before}/4`);

        await setActorValue(page, actorId, 'system.spells.spell1.value', before - 1);
        const after = await page.evaluate(
            id => game.actors.get(id).system.spells.spell1.value, actorId);

        expect(await hudGroupActions(page, 'spells_spells1')).toHaveLength(1);
        expect(await slotBadge()).toBe(`${after}/4`);
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
});
