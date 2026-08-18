export const MODULE = { ID: 'token-action-hud-sfrpg' };

export const SYSTEM = { ID: 'sfrpg' };

/**
 * "2.1" rather than "2": Token Action HUD Core 2.1 deprecated the encodedValue
 * action format this module does not use, and a further minor could move the
 * contract again. Pinning to the minor makes that break loud instead of silent.
 */
export const REQUIRED_CORE_MODULE_VERSION = '2.1';

/** Actor types this module builds actions for. */
export const CHARACTER_TYPE = 'character';
export const MECH_TYPE = 'mech';

/**
 * Spell levels Starfinder uses. The system's own spellbook keys slots as
 * `system.spells.spell0` through `spell6`, so this is the full range rather
 * than a display choice.
 */
export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Inventory item types, split into the groups the Inventory tab shows.
 *
 * `weapon` is absent: weapons are reached from the Attack tab, where they roll
 * rather than being consumed.
 */
export const INVENTORY_TYPES = {
    consumables: ['consumable'],
    equipment: ['equipment', 'shield'],
    otherItems: ['technological', 'hybrid', 'magic', 'goods', 'container']
};

/** Mech component types shown on the Systems tab, in the order they appear. */
export const MECH_CHASSIS_TYPES = ['mechFrame', 'mechPowerCore', 'mechUpperLimb', 'mechLowerLimb'];

/** Action types, resolved by the roll handler. */
export const ACTION_TYPE = {
    ability: 'ability',
    save: 'save',
    skill: 'skill',
    attack: 'attack',
    damage: 'damage',
    item: 'item',
    spell: 'spell',
    feat: 'feat',
    itemSheet: 'itemSheet',
    missionPod: 'missionPod',
    mechAction: 'mechAction',
    cancelOverride: 'cancelOverride',
    initiative: 'initiative',
    endTurn: 'endTurn',
    shortRest: 'shortRest',
    longRest: 'longRest'
};

export const GROUP = {
    abilities: { id: 'abilities', name: 'tokenActionHud.sfrpg.abilities', type: 'system' },
    saves: { id: 'saves', name: 'tokenActionHud.sfrpg.saves', type: 'system' },
    skills: { id: 'skills', name: 'tokenActionHud.sfrpg.skills', type: 'system' },
    weaponAttacks: { id: 'weaponAttacks', name: 'tokenActionHud.sfrpg.weaponAttacks', type: 'system' },
    weaponDamage: { id: 'weaponDamage', name: 'tokenActionHud.sfrpg.weaponDamage', type: 'system' },
    consumables: { id: 'consumables', name: 'tokenActionHud.sfrpg.consumables', type: 'system' },
    equipment: { id: 'equipment', name: 'tokenActionHud.sfrpg.equipment', type: 'system' },
    otherItems: { id: 'otherItems', name: 'tokenActionHud.sfrpg.otherItems', type: 'system' },
    feats: { id: 'feats', name: 'tokenActionHud.sfrpg.feats', type: 'system' },
    mechWeaponAttacks: { id: 'mechWeaponAttacks', name: 'tokenActionHud.sfrpg.weaponAttacks', type: 'system' },
    mechWeaponDamage: { id: 'mechWeaponDamage', name: 'tokenActionHud.sfrpg.weaponDamage', type: 'system' },
    mechAuxiliary: { id: 'mechAuxiliary', name: 'tokenActionHud.sfrpg.mechAuxiliary', type: 'system' },
    mechMissionPods: { id: 'mechMissionPods', name: 'tokenActionHud.sfrpg.mechMissionPods', type: 'system' },
    mechUpgrades: { id: 'mechUpgrades', name: 'tokenActionHud.sfrpg.mechUpgrades', type: 'system' },
    mechChassis: { id: 'mechChassis', name: 'tokenActionHud.sfrpg.mechChassis', type: 'system' },
    mechPPActions: { id: 'mechPPActions', name: 'tokenActionHud.sfrpg.mechPPActions', type: 'system' },
    mechSpecialActions: { id: 'mechSpecialActions', name: 'tokenActionHud.sfrpg.mechSpecialActions', type: 'system' },
    mechGearActions: { id: 'mechGearActions', name: 'tokenActionHud.sfrpg.mechGearActions', type: 'system' },
    utility: { id: 'utility', name: 'tokenActionHud.sfrpg.utility', type: 'system' },
    ...Object.fromEntries(SPELL_LEVELS.map(level => [
        `spells${level}`,
        { id: `spells${level}`, name: `tokenActionHud.sfrpg.spellLevel${level}`, type: 'system' }
    ]))
};
