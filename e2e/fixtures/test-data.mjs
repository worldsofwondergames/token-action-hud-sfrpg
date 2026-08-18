const TEST_PREFIX = '_E2E_';

export function prefixName(name) {
    return TEST_PREFIX + name;
}

/**
 * A character with ability scores and skill ranks.
 *
 * `abilities.<id>.base` is the stored score; `mod` is derived from it by the
 * rules engine, so tests read `mod` back rather than setting it.
 */
export async function createCharacter(page, name, { abilities = {}, skills = {}, spellSlots = {} } = {}) {
    return page.evaluate(async ({ actorName, abilityScores, skillRanks, slots }) => {
        const abilityData = {};
        for (const id of Object.keys(CONFIG.SFRPG.abilities)) {
            abilityData[id] = { base: abilityScores[id] ?? 10 };
        }

        const skillData = {};
        for (const [id, ranks] of Object.entries(skillRanks)) {
            skillData[id] = { ranks, value: 3 };
        }

        const spellData = {};
        for (const [level, max] of Object.entries(slots)) {
            spellData[`spell${level}`] = { value: max, max };
        }

        const actor = await Actor.create({
            name: actorName,
            type: 'character',
            system: {
                abilities: abilityData,
                skills: skillData,
                ...(Object.keys(spellData).length ? { spells: spellData } : {})
            }
        });
        return actor.id;
    }, { actorName: name, abilityScores: abilities, skillRanks: skills, slots: spellSlots });
}

export async function createMech(page, name, { pp = 5, tier = 1 } = {}) {
    return page.evaluate(async ({ actorName, ppValue, mechTier }) => {
        const actor = await Actor.create({
            name: actorName,
            type: 'mech',
            system: {
                details: { tier: mechTier },
                attributes: { pp: { value: ppValue, max: ppValue } }
            }
        });
        return actor.id;
    }, { actorName: name, ppValue: pp, mechTier: tier });
}

/** Read one path out of an actor's live data. */
export async function actorValue(page, actorId, path) {
    return page.evaluate(({ id, p }) =>
        foundry.utils.getProperty(game.actors.get(id), p), { id: actorId, p: path });
}

export async function setActorValue(page, actorId, path, value) {
    await page.evaluate(async ({ id, p, v }) => {
        await game.actors.get(id).update({ [p]: v });
    }, { id: actorId, p: path, v: value });
}

export async function addWeapon(page, actorId, { name, equipped = true, damage = '1d6' } = {}) {
    return page.evaluate(async ({ id, weaponName, isEquipped, damageFormula }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: weaponName,
            type: 'weapon',
            system: {
                actionType: 'rwak',
                equipped: isEquipped,
                weaponType: 'smallA',
                damage: { parts: [{ formula: damageFormula, types: { kinetic: true }, operator: '' }] }
            }
        }]);
        return item.id;
    }, { id: actorId, weaponName: name, isEquipped: equipped, damageFormula: damage });
}

export async function addSpell(page, actorId, { name, level = 1 } = {}) {
    return page.evaluate(async ({ id, spellName, spellLevel }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: spellName,
            type: 'spell',
            system: { level: spellLevel, preparation: { mode: '' } }
        }]);
        return item.id;
    }, { id: actorId, spellName: name, spellLevel: level });
}

export async function addMechWeapon(page, actorId, { name, slot = 'frame', damage = '2d6' } = {}) {
    return page.evaluate(async ({ id, weaponName, weaponSlot, damageFormula }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: weaponName,
            type: 'mechWeapon',
            system: {
                slot: weaponSlot,
                weaponType: 'ranged',
                damage: { parts: [{ formula: damageFormula, types: { kinetic: true }, operator: '' }] }
            }
        }]);
        return item.id;
    }, { id: actorId, weaponName: name, weaponSlot: slot, damageFormula: damage });
}

/** An auxiliary system carrying one gear action, which the Actions tab lists. */
export async function addMechAuxiliary(page, actorId, { name, action } = {}) {
    return page.evaluate(async ({ id, itemName, gearAction }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: itemName,
            type: 'mechAuxiliary',
            system: { actions: gearAction ? [gearAction] : [] }
        }]);
        return item.id;
    }, { id: actorId, itemName: name, gearAction: action });
}

export async function deleteActor(page, actorId) {
    await page.evaluate(async (id) => {
        const actor = game.actors.get(id);
        if (actor) await actor.delete();
    }, actorId);
}

export async function cleanupE2EActors(page) {
    await page.evaluate(async (prefix) => {
        for (const actor of game.actors.filter(a => a.name.startsWith(prefix))) {
            await actor.delete();
        }
    }, TEST_PREFIX);
}
