import { test, expect } from '../fixtures/foundry-test.mjs';
import {
    addFeat,
    addSpell,
    addWeapon,
    createNpc,
    deleteActor,
    prefixName
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
 * Run `body` with Token Action HUD on and one NPC token selected, and put the
 * world back afterwards whatever happens.
 */
async function withNpc(page, { name, abilities, skills }, body) {
    let actorId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        actorId = await createNpc(page, prefixName(name), { abilities, skills });
        await body(actorId, async () => {
            scene = await buildScene(page, [actorId]);
            await selectToken(page, actorId);
        });
    } finally {
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        if (actorId) await deleteActor(page, actorId);
        await reload(page);
    }
}

/**
 * An NPC's sheet shows the skills marked `enabled`, not the ones with ranks, so
 * the HUD follows the same flag. The expected list is read from the actor.
 */
test('NPC Skills tab lists the enabled skills, and the setting adds the rest', async ({ page }) => {
    await withNpc(page, { name: 'SkillNpc', skills: ['ste', 'per'] }, async (actorId, select) => {
        await select();

        await setModuleSetting(page, 'showUntrainedSkills', false);
        const enabled = await page.evaluate(id => Object.entries(game.actors.get(id).system.skills)
            .filter(([, skill]) => skill.enabled)
            .map(([key]) => game.i18n.localize(CONFIG.SFRPG.skills[key.substring(0, 3)])), actorId);

        expect(enabled).toHaveLength(2);
        expect((await hudGroupActions(page, 'skills_skills')).sort()).toEqual(enabled.sort());

        await setModuleSetting(page, 'showUntrainedSkills', true);
        const all = await page.evaluate(id => Object.keys(game.actors.get(id).system.skills).length, actorId);
        expect(await hudGroupActions(page, 'skills_skills')).toHaveLength(all);
    });
});

/**
 * Activated features go to Actions with their action type on the badge; passive
 * ones go to the group for their category. A theme feature has no NPC group of
 * its own and goes to Other Features, as on the sheet.
 */
test('NPC features split into Actions and the sheet\'s feature categories', async ({ page }) => {
    await withNpc(page, { name: 'FeatureNpc' }, async (actorId, select) => {
        await addFeat(page, actorId, { name: prefixName('Leap'), activation: 'move' });
        await addFeat(page, actorId, { name: prefixName('Toughness'), category: 'feat' });
        await addFeat(page, actorId, { name: prefixName('Darkvision'), category: 'universalCreatureRule' });
        await addFeat(page, actorId, { name: prefixName('Blindsense'), category: 'universalCreatureRule' });
        await addFeat(page, actorId, { name: prefixName('Keen Nose'), category: 'speciesFeature' });
        await addFeat(page, actorId, { name: prefixName('Odd Trait'), category: 'themeFeature' });
        await select();

        expect(await hudGroupActions(page, 'npcActions_npcActions')).toEqual([prefixName('Leap')]);
        const moveLabel = await page.evaluate(
            () => game.i18n.localize(CONFIG.SFRPG.abilityActivationTypes.move));
        expect(await hudActionInfo(page, prefixName('Leap'))).toBe(moveLabel);

        expect(await hudGroupActions(page, 'npcFeatures_npcFeats')).toEqual([prefixName('Toughness')]);
        expect(await hudGroupActions(page, 'npcFeatures_npcUniversalCreatureRules'))
            .toEqual([prefixName('Blindsense'), prefixName('Darkvision')]);
        expect(await hudGroupActions(page, 'npcFeatures_npcSpeciesFeatures')).toEqual([prefixName('Keen Nose')]);
        expect(await hudGroupActions(page, 'npcFeatures_npcOtherFeatures')).toEqual([prefixName('Odd Trait')]);
    });
});

/**
 * A natural attack written as a feature belongs on the Attack tab beside the
 * weapons, and an unequipped weapon does not, matching the NPC sheet.
 *
 * The system equips every weapon added to an NPC, so the spare is unequipped
 * after it is created.
 */
test('NPC Attack tab lists equipped weapons and attacking features', async ({ page }) => {
    await withNpc(page, { name: 'ClawNpc' }, async (actorId, select) => {
        await addWeapon(page, actorId, { name: prefixName('Claw'), equipped: true });
        const spareId = await addWeapon(page, actorId, { name: prefixName('Spare Pistol') });
        await page.evaluate(async ({ id, item }) => {
            await game.actors.get(id).items.get(item).update({ 'system.equipped': false });
        }, { id: actorId, item: spareId });
        await addFeat(page, actorId, {
            name: prefixName('Bite'),
            activation: 'action',
            actionType: 'mwak',
            damage: '1d8'
        });
        await select();

        const expected = [prefixName('Bite'), prefixName('Claw')];
        expect(await hudGroupActions(page, 'attack_weaponAttacks')).toEqual(expected);
        expect(await hudGroupActions(page, 'attack_weaponDamage')).toEqual(expected);
    });
});

/**
 * Most monster spell-like abilities are Always Available or Innate, which the
 * spellbook lists apart from the levels. A slotted spell stays in its level.
 */
test('NPC spells group by preparation mode before level', async ({ page }) => {
    await withNpc(page, { name: 'CasterNpc' }, async (actorId, select) => {
        await addSpell(page, actorId, { name: prefixName('Detect Magic'), level: 0, mode: 'always' });
        await addSpell(page, actorId, { name: prefixName('Fear'), level: 1, mode: 'innate' });
        await addSpell(page, actorId, { name: prefixName('Mystic Cure'), level: 1, mode: '' });
        await select();

        expect(await hudGroupActions(page, 'spells_spellsAlways')).toEqual([prefixName('Detect Magic')]);
        expect(await hudGroupActions(page, 'spells_spellsInnate')).toEqual([prefixName('Fear')]);
        expect(await hudGroupActions(page, 'spells_spells1')).toEqual([prefixName('Mystic Cure')]);
    });
});

/**
 * Clicking an NPC's ability, save, skill and attack each reaches the system's
 * own roll, and a rolled chat message is the evidence that it did.
 */
test('Clicking an NPC ability, save, skill and attack each produces a roll', async ({ page }) => {
    let previousQuickRoll;
    try {
        previousQuickRoll = await setQuickRoll(page, true);

        await withNpc(page, { name: 'RollNpc', abilities: { str: 16 }, skills: ['ste'] },
            async (actorId, select) => {
                await addWeapon(page, actorId, { name: prefixName('Slam'), equipped: true });
                await select();

                const labels = await page.evaluate(() => [
                    game.i18n.localize(CONFIG.SFRPG.saves.will),
                    game.i18n.localize(CONFIG.SFRPG.skills.ste)
                ]);

                const clicks = [
                    ['STR', 'abilities_abilities'],
                    [labels[0], 'saves_saves'],
                    [labels[1], 'skills_skills'],
                    [prefixName('Slam'), 'attack_weaponAttacks']
                ];
                for (const [label, group] of clicks) {
                    const before = await chatMessageCount(page);
                    await clickAction(page, label, { group });
                    const message = await waitForChatMessage(page, before);
                    expect(message.rollCount).toBeGreaterThan(0);
                }
            });
    } finally {
        if (previousQuickRoll !== undefined) await setQuickRoll(page, previousQuickRoll);
    }
});
