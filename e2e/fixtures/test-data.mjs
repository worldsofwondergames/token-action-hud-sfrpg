const TEST_PREFIX = '_E2E_';

export function prefixName(name) {
    return TEST_PREFIX + name;
}

/**
 * A character with ability scores and skill ranks.
 *
 * `abilities.<id>.base` is the stored score; `mod` is derived from it by the
 * rules engine, so tests read `mod` back rather than setting it.
 *
 * The rules engine caps a skill's ranks at the character's total class level,
 * so a character given ranks also needs `classLevel` at least that high, or the
 * ranks read back as 0.
 */
export async function createCharacter(page, name, { abilities = {}, skills = {}, spellSlots = {}, classLevel = 0 } = {}) {
    return page.evaluate(async ({ actorName, abilityScores, skillRanks, slots, level }) => {
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
        if (level > 0) {
            await actor.createEmbeddedDocuments('Item', [{
                name: '_E2E_Class',
                type: 'class',
                system: { levels: level }
            }]);
        }
        return actor.id;
    }, { actorName: name, abilityScores: abilities, skillRanks: skills, slots: spellSlots, level: classLevel });
}

/**
 * A mech whose token is linked to the actor. An unlinked token has its own copy
 * of the actor, so Power Points spent from the HUD would leave the actor that
 * the tests read untouched.
 */
export async function createMech(page, name, { pp = 5, tier = 1 } = {}) {
    return page.evaluate(async ({ actorName, ppValue, mechTier }) => {
        const actor = await Actor.create({
            name: actorName,
            type: 'mech',
            prototypeToken: { actorLink: true },
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

/** `mode` is the preparation mode: '' for a slotted spell, or 'always' or 'innate'. */
export async function addSpell(page, actorId, { name, level = 1, mode = '' } = {}) {
    return page.evaluate(async ({ id, spellName, spellLevel, spellMode }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: spellName,
            type: 'spell',
            system: { level: spellLevel, preparation: { mode: spellMode } }
        }]);
        return item.id;
    }, { id: actorId, spellName: name, spellLevel: level, spellMode: mode });
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

/**
 * An NPC. `skills` lists the skills to enable, which is what puts a skill on the
 * NPC sheet; their values are left to the system.
 */
export async function createNpc(page, name, { abilities = {}, skills = [] } = {}) {
    return page.evaluate(async ({ actorName, abilityScores, enabledSkills }) => {
        const abilityData = {};
        for (const [id, base] of Object.entries(abilityScores)) abilityData[id] = { base };

        const skillData = {};
        for (const id of enabledSkills) skillData[id] = { enabled: true };

        const actor = await Actor.create({
            name: actorName,
            type: 'npc2',
            system: { abilities: abilityData, skills: skillData }
        });
        return actor.id;
    }, { actorName: name, abilityScores: abilities, enabledSkills: skills });
}

/** A feature, optionally activated or carrying an attack and damage. */
export async function addFeat(page, actorId, {
    name,
    category = 'feat',
    activation = '',
    actionType = '',
    damage = null
} = {}) {
    return page.evaluate(async ({ id, featName, featCategory, activationType, featActionType, damageFormula }) => {
        const [item] = await game.actors.get(id).createEmbeddedDocuments('Item', [{
            name: featName,
            type: 'feat',
            system: {
                details: { category: featCategory },
                activation: { type: activationType },
                actionType: featActionType,
                ...(damageFormula
                    ? { damage: { parts: [{ formula: damageFormula, types: { piercing: true }, operator: '' }] } }
                    : {})
            }
        }]);
        return item.id;
    }, {
        id: actorId,
        featName: name,
        featCategory: category,
        activationType: activation,
        featActionType: actionType,
        damageFormula: damage
    });
}
