/* global canvas, Combat -- Foundry globals used inside page.evaluate callbacks */
import { test, expect } from '../fixtures/foundry-test.mjs';
import { createCharacter, deleteActor, prefixName } from '../fixtures/test-data.mjs';
import {
    buildScene,
    captureModuleConfig,
    enableTah,
    hudText,
    reload,
    restoreModuleConfig,
    selectToken,
    teardownScene
} from '../fixtures/tah.mjs';

/**
 * End Turn belongs only to whoever is actually up. Offering it otherwise invites
 * a player to end someone else's turn.
 */
test('End Turn appears only on the actor\'s own turn', async ({ page }) => {
    let firstId;
    let secondId;
    let scene;
    let moduleConfig;

    try {
        moduleConfig = await captureModuleConfig(page);
        await enableTah(page);

        const endTurn = await page.evaluate(() => game.i18n.localize('tokenActionHud.sfrpg.endTurn'));
        const rollInitiative = await page.evaluate(() =>
            game.i18n.localize('tokenActionHud.sfrpg.rollInitiative'));

        firstId = await createCharacter(page, prefixName('ET_A'), { abilities: { dex: 18 } });
        secondId = await createCharacter(page, prefixName('ET_B'), { abilities: { dex: 8 } });
        scene = await buildScene(page, [firstId, secondId]);

        // 1. No combat at all.
        await selectToken(page, firstId);
        expect(await hudText(page)).not.toContain(endTurn);

        // 2. Combat exists but has not started, so nobody has a turn yet.
        await page.evaluate(async () => {
            const combat = await Combat.create({ scene: canvas.scene.id });
            await combat.activate();
            const tokens = canvas.tokens.placeables.filter(t => t.actor?.name?.startsWith('_E2E_ET_'));
            await combat.createEmbeddedDocuments('Combatant', tokens.map(t => ({
                tokenId: t.id, sceneId: canvas.scene.id, actorId: t.actor.id
            })));
        });
        await selectToken(page, firstId);
        expect(await hudText(page)).not.toContain(endTurn);

        // 3. Started: only the current combatant is offered End Turn.
        const currentActorId = await page.evaluate(async () => {
            const combat = game.combat;
            for (const combatant of combat.combatants) {
                await combat.setInitiative(combatant.id, combatant.actor.system.abilities.dex.mod);
            }
            await combat.startCombat();
            return combat.combatant.actorId;
        });
        const otherActorId = currentActorId === firstId ? secondId : firstId;

        await selectToken(page, currentActorId);
        expect(await hudText(page)).toContain(endTurn);

        await selectToken(page, otherActorId);
        const offTurn = await hudText(page);
        expect(offTurn).not.toContain(endTurn);
        // Roll Initiative stays available regardless of whose turn it is; this
        // also proves the Utility group is still being built, so the assertion
        // above is not passing merely because the HUD is empty.
        expect(offTurn).toContain(rollInitiative);
    } finally {
        await page.evaluate(async () => {
            for (const combat of [...game.combats]) await combat.delete();
        });
        await restoreModuleConfig(page, moduleConfig);
        if (scene) await teardownScene(page, scene);
        for (const id of [firstId, secondId]) if (id) await deleteActor(page, id);
        await reload(page);
    }
});
