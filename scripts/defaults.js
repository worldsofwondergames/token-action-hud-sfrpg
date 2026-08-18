import { GROUP, SPELL_LEVELS } from './constants.js';

export let DEFAULTS = null;

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    const groups = GROUP;
    Object.values(groups).forEach((group) => {
        group.name = coreModule.api.Utils.i18n(group.name);
        group.listName = `Group: ${group.name}`;
    });

    const i18n = (key) => coreModule.api.Utils.i18n(key);
    const nest = (tab, group) => ({ ...group, nestId: `${tab}_${group.id}` });
    const tab = (id, nameKey, tabGroups) => ({
        nestId: id,
        id,
        name: i18n(nameKey),
        groups: tabGroups.map(group => nest(id, group))
    });

    /**
     * Every tab needs at least one subgroup. Core's group template renders a
     * subgroups container and never renders actions directly, so a top-level
     * group with `groups: []` has nowhere to put its actions and shows up empty.
     *
     * The character tabs and the mech tabs are both here because Core builds one
     * layout for every actor. A character fills the first eight and a mech the
     * last three; Core drops the tabs that end up with no actions, so neither
     * actor sees the other's.
     */
    DEFAULTS = {
        layout: [
            tab('abilities', 'tokenActionHud.sfrpg.abilities', [groups.abilities]),
            tab('saves', 'tokenActionHud.sfrpg.saves', [groups.saves]),
            tab('skills', 'tokenActionHud.sfrpg.skills', [groups.skills]),
            tab('attack', 'tokenActionHud.sfrpg.attack', [groups.weaponAttacks, groups.weaponDamage]),
            tab('inventory', 'tokenActionHud.sfrpg.inventory', [
                groups.consumables,
                groups.equipment,
                groups.otherItems
            ]),
            tab('spells', 'tokenActionHud.sfrpg.spells', SPELL_LEVELS.map(level => groups[`spells${level}`])),
            tab('feats', 'tokenActionHud.sfrpg.feats', [groups.feats]),
            tab('mechWeapons', 'tokenActionHud.sfrpg.mechWeapons', [
                groups.mechWeaponAttacks,
                groups.mechWeaponDamage
            ]),
            tab('mechSystems', 'tokenActionHud.sfrpg.mechSystems', [
                groups.mechAuxiliary,
                groups.mechMissionPods,
                groups.mechUpgrades,
                groups.mechChassis
            ]),
            tab('mechActions', 'tokenActionHud.sfrpg.mechActions', [
                groups.mechPPActions,
                groups.mechSpecialActions,
                groups.mechGearActions
            ]),
            tab('utility', 'tokenActionHud.sfrpg.utility', [groups.utility])
        ],
        groups: Object.values(groups)
    };
});
