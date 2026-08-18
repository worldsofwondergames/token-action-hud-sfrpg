import {
    ACTION_TYPE,
    CHARACTER_TYPE,
    GROUP,
    INVENTORY_TYPES,
    MECH_CHASSIS_TYPES,
    MECH_TYPE,
    MODULE,
    SPELL_LEVELS
} from './constants.js';

export let ActionHandler = null;

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    const Utils = coreModule.api.Utils;

    ActionHandler = class ActionHandler extends coreModule.api.ActionHandler {
        /**
         * Called by Token Action HUD Core to populate the HUD for the current
         * selection.
         *
         * @override
         * @param {string[]} groupIds
         */
        async buildSystemActions(groupIds) {
            if (!this.actor) {
                // Nothing selected, or several tokens: only the actions that do
                // not belong to one actor make sense.
                await this.#safely('utility', () => this.#buildCombatActions());
                return;
            }

            switch (this.actor.type) {
                case CHARACTER_TYPE:
                    await this.#safely('abilities', () => this.#buildAbilities());
                    await this.#safely('saves', () => this.#buildSaves());
                    await this.#safely('skills', () => this.#buildSkills());
                    await this.#safely('attack', () => this.#buildWeapons(
                        this.actor.items.filter(i => i.type === 'weapon'),
                        { attacks: GROUP.weaponAttacks, damage: GROUP.weaponDamage }
                    ));
                    await this.#safely('inventory', () => this.#buildInventory());
                    await this.#safely('spells', () => this.#buildSpells());
                    await this.#safely('feats', () => this.#buildFeats());
                    await this.#safely('utility', () => this.#buildCharacterUtility());
                    break;

                case MECH_TYPE:
                    await this.#safely('mech weapons', () => this.#buildWeapons(
                        this.actor.items.filter(i => i.type === 'mechWeapon'),
                        { attacks: GROUP.mechWeaponAttacks, damage: GROUP.mechWeaponDamage }
                    ));
                    await this.#safely('mech systems', () => this.#buildMechSystems());
                    await this.#safely('mech actions', () => this.#buildMechActions());
                    await this.#safely('utility', () => this.#buildMechUtility());
                    break;

                default:
                    // npc2, drone, starship, vehicle and hazard are not supported
                    // yet. They build an empty HUD rather than an error.
                    break;
            }
        }

        /**
         * Run one section of the build, keeping any failure inside it.
         *
         * Core calls `buildSystemActions()` from inside a `Promise.all` with no
         * error handling of its own, and `TokenActionHud#performUpdate()` sets
         * `isUpdating` immediately before that call and clears it only after --
         * there is no `try/finally`. An exception escaping from here therefore
         * leaves the flag set, and every later update waits five seconds on it
         * and then aborts. One bad item would silently disable the HUD for the
         * rest of the session, for every actor, not just the one that broke.
         * Losing a single group is by far the smaller failure.
         *
         * @private
         */
        async #safely(section, build) {
            try {
                await build();
            } catch (error) {
                console.error(`${MODULE.ID}: failed to build the ${section} actions`, error);
                notifyOnce(
                    `build:${section}`,
                    `Token Action HUD Starfinder could not build the ${section} actions.`
                    + ' See the browser console for details.'
                );
            }
        }

        /* ---------------------------------------------------------------- */
        /* Character                                                        */
        /* ---------------------------------------------------------------- */

        /** Ability checks, in the system's own display order. */
        #buildAbilities() {
            const abilities = this.actor.system?.abilities;
            if (!abilities) return;

            const actions = Object.entries(CONFIG.SFRPG.abilities)
                .filter(([id]) => abilities[id])
                .map(([id, label]) => ({
                    id: `ability-${id}`,
                    name: id.toUpperCase(),
                    listName: `Action: ${Utils.i18n(label)}`,
                    info1: { text: signed(abilities[id].mod) },
                    system: { actionType: ACTION_TYPE.ability, actionId: id }
                }));

            this.addActions(actions, { id: GROUP.abilities.id });
        }

        /** Fortitude, Reflex and Will. */
        #buildSaves() {
            const attributes = this.actor.system?.attributes;
            if (!attributes) return;

            const actions = Object.entries(CONFIG.SFRPG.saves)
                .filter(([id]) => attributes[id])
                .map(([id, label]) => ({
                    id: `save-${id}`,
                    name: Utils.i18n(label),
                    listName: `Action: ${Utils.i18n(label)}`,
                    info1: { text: signed(attributes[id].bonus) },
                    system: { actionType: ACTION_TYPE.save, actionId: id }
                }));

            this.addActions(actions, { id: GROUP.saves.id });
        }

        /**
         * Skills.
         *
         * A Starfinder character carries every skill whether or not it has ranks,
         * so the default is to show only the trained ones. Professions are
         * separate entries keyed `pro`, `pro1`, `pro2`... and carry a `subname`,
         * which is the only thing telling two of them apart.
         */
        #buildSkills() {
            const skills = this.actor.system?.skills;
            if (!skills) return;

            const showUntrained = game.settings.get(MODULE.ID, 'showUntrainedSkills');

            const actions = Object.entries(skills)
                .filter(([, skill]) => showUntrained || (skill.ranks ?? 0) > 0)
                .map(([id, skill]) => ({
                    id: `skill-${id}`,
                    name: skillName(id, skill),
                    listName: `Action: ${skillName(id, skill)}`,
                    info1: { text: signed(skill.mod) },
                    system: { actionType: ACTION_TYPE.skill, actionId: id }
                }))
                .sort(byName);

            this.addActions(actions, { id: GROUP.skills.id });
        }

        /**
         * Weapons, as one attack action and one damage action per weapon, in two
         * groups rather than a submenu per weapon: attacking is the commonest
         * thing the HUD is opened for and should cost one click.
         *
         * The sheet only offers attack and damage on an equipped weapon, so the
         * HUD applies the same rule instead of showing buttons that do nothing.
         *
         * @param {Array} weapons
         * @param {object} groups Attack and damage groups to fill
         */
        #buildWeapons(weapons, groups) {
            const usable = weapons.filter(item => item.type !== 'weapon' || item.system.equipped);

            const attacks = usable
                .filter(item => item.hasAttack)
                .map(item => ({
                    id: `attack-${item.id}`,
                    name: item.name,
                    listName: `Action: ${item.name} (Attack)`,
                    img: Utils.getImage(item),
                    system: { actionType: ACTION_TYPE.attack, actionId: item.id }
                }))
                .sort(byName);

            const damage = usable
                .filter(item => item.hasDamage)
                .map(item => ({
                    id: `damage-${item.id}`,
                    name: item.name,
                    listName: `Action: ${item.name} (Damage)`,
                    img: Utils.getImage(item),
                    system: { actionType: ACTION_TYPE.damage, actionId: item.id }
                }))
                .sort(byName);

            this.addActions(attacks, { id: groups.attacks.id });
            this.addActions(damage, { id: groups.damage.id });
        }

        /**
         * Carried items, split the way the sheet splits them.
         *
         * `equippable` rather than `equipped` decides what the "show unequipped
         * items" setting hides: a consumable or a trade good is never equipped,
         * and filtering on `equipped` alone would empty those groups.
         */
        #buildInventory() {
            const showUnequipped = game.settings.get(MODULE.ID, 'showUnequippedItems');

            for (const [groupId, types] of Object.entries(INVENTORY_TYPES)) {
                const actions = this.actor.items
                    .filter(item => types.includes(item.type))
                    .filter(item => showUnequipped || !item.system.equippable || item.system.equipped)
                    .map(item => this.#itemAction(item))
                    .sort(byName);

                this.addActions(actions, { id: GROUP[groupId].id });
            }
        }

        /** @private */
        #itemAction(item) {
            const uses = item.hasUses() ? `${item.getRemainingUses()}/${item.getMaxUses()}` : null;
            const quantity = (item.system.quantity ?? 1) > 1 ? String(item.system.quantity) : null;
            const info = uses ?? quantity;

            return {
                id: `item-${item.id}`,
                name: item.name,
                listName: `Action: ${item.name}`,
                img: Utils.getImage(item),
                ...(info ? { info1: { text: info } } : {}),
                system: { actionType: ACTION_TYPE.item, actionId: item.id }
            };
        }

        /**
         * Spells, one group per level.
         *
         * Slot availability is decided by the spell-slot dialog `useSpell()`
         * raises, not here: the system permits casting a spell from a higher
         * slot, so a level with no slots left does not mean its spells are
         * uncastable. The remaining slots are shown on the level's own heading
         * instead, where they read once rather than once per spell.
         */
        #buildSpells() {
            const spells = this.actor.items.filter(item => item.type === 'spell');
            if (!spells.length) return;

            const contained = containedItemIds(this.actor);
            const slots = this.actor.system?.spells ?? {};

            for (const level of SPELL_LEVELS) {
                const group = GROUP[`spells${level}`];

                const actions = spells
                    .filter(item => (item.system.level ?? 0) === level)
                    .filter(item => !contained.has(item.id))
                    .map(item => ({
                        id: `spell-${item.id}`,
                        name: item.name,
                        listName: `Action: ${item.name}`,
                        img: Utils.getImage(item),
                        system: { actionType: ACTION_TYPE.spell, actionId: item.id }
                    }))
                    .sort(byName);

                if (!actions.length) continue;

                this.addActions(actions, { id: group.id });

                const perDay = slots[`spell${level}`];
                if (level > 0 && perDay?.max) {
                    this.groupHandler.updateGroup({
                        id: group.id,
                        type: 'system',
                        info1: { text: `${perDay.value ?? 0}/${perDay.max}` }
                    });
                }
            }
        }

        /** Feats, posted to chat by the system's own item card. */
        #buildFeats() {
            const actions = this.actor.items
                .filter(item => item.type === 'feat')
                .map(item => ({
                    id: `feat-${item.id}`,
                    name: item.name,
                    listName: `Action: ${item.name}`,
                    img: Utils.getImage(item),
                    system: { actionType: ACTION_TYPE.feat, actionId: item.id }
                }))
                .sort(byName);

            this.addActions(actions, { id: GROUP.feats.id });
        }

        /** Combat actions plus the two rests. */
        #buildCharacterUtility() {
            const actions = [
                ...this.#combatActions(),
                {
                    id: 'shortRest',
                    name: Utils.i18n('tokenActionHud.sfrpg.shortRest'),
                    listName: 'Action: Short Rest',
                    system: { actionType: ACTION_TYPE.shortRest, actionId: 'shortRest' }
                },
                {
                    id: 'longRest',
                    name: Utils.i18n('tokenActionHud.sfrpg.longRest'),
                    listName: 'Action: Long Rest',
                    system: { actionType: ACTION_TYPE.longRest, actionId: 'longRest' }
                }
            ];

            this.addActions(actions, { id: GROUP.utility.id });
        }

        /* ---------------------------------------------------------------- */
        /* Mech                                                             */
        /* ---------------------------------------------------------------- */

        /**
         * Installed components.
         *
         * Mission pods toggle rather than roll, and their label says which way
         * the click goes. Everything else posts its own item card.
         */
        #buildMechSystems() {
            const auxiliary = this.actor.items
                .filter(item => item.type === 'mechAuxiliary')
                .map(item => this.#componentAction(item))
                .sort(byName);
            this.addActions(auxiliary, { id: GROUP.mechAuxiliary.id });

            const pods = this.actor.items
                .filter(item => item.type === 'mechMissionPod')
                .map(item => ({
                    id: `pod-${item.id}`,
                    name: game.i18n.format(
                        item.system.isActive
                            ? 'tokenActionHud.sfrpg.deactivatePod'
                            : 'tokenActionHud.sfrpg.activatePod',
                        { pod: item.name }
                    ),
                    listName: `Action: ${item.name}`,
                    img: Utils.getImage(item),
                    cssClass: item.system.isActive ? 'toggle active' : 'toggle',
                    system: { actionType: ACTION_TYPE.missionPod, actionId: item.id }
                }))
                .sort(byName);
            this.addActions(pods, { id: GROUP.mechMissionPods.id });

            const upgrades = this.actor.items
                .filter(item => item.type === 'mechUpgrade')
                .map(item => this.#componentAction(item))
                .sort(byName);
            this.addActions(upgrades, { id: GROUP.mechUpgrades.id });

            const chassis = this.actor.items
                .filter(item => MECH_CHASSIS_TYPES.includes(item.type))
                .map(item => this.#componentAction(item))
                .sort(byName);
            this.addActions(chassis, { id: GROUP.mechChassis.id });
        }

        /** @private */
        #componentAction(item) {
            return {
                id: `component-${item.id}`,
                name: item.name,
                listName: `Action: ${item.name}`,
                img: Utils.getImage(item),
                system: { actionType: ACTION_TYPE.item, actionId: item.id }
            };
        }

        /**
         * The three action lists the mech sheet's Actions tab shows.
         *
         * The Power Point and Special tables come from CONFIG.SFRPG, which is
         * also what `useMechAction()` resolves an index against, so the HUD
         * cannot list an action the actor would not recognise.
         */
        #buildMechActions() {
            const { mechPPActions, mechSpecialActions, mechActionTypes } = CONFIG.SFRPG;

            // These tables are published by the Starfinder system. Older versions
            // keep them inside the mech sheet, where nothing outside it can read
            // them, so there is no list to build from and no entry point to call.
            if (!mechPPActions || !mechSpecialActions || !mechActionTypes) {
                notifyOnce(
                    'mechActionTables',
                    'Token Action HUD Starfinder: this version of the Starfinder system does not'
                    + ' publish the mech action tables on CONFIG.SFRPG, so the mech Actions tab'
                    + ' stays empty. The rest of the HUD is unaffected.'
                );
                return;
            }

            const currentPP = this.actor.system?.attributes?.pp?.value ?? 0;

            const ppActions = mechPPActions.map((action, index) => ({
                id: `mech-pp-${index}`,
                name: Utils.i18n(action.name),
                listName: `Action: ${Utils.i18n(action.name)}`,
                info1: { text: `${action.ppCost} PP` },
                // The actor refuses an action it cannot pay for; dimming it says
                // so before the click rather than after.
                cssClass: currentPP >= action.ppCost ? '' : 'disabled',
                system: {
                    actionType: ACTION_TYPE.mechAction,
                    actionId: `pp-${index}`,
                    category: 'pp',
                    index
                }
            }));
            this.addActions(ppActions, { id: GROUP.mechPPActions.id });

            const specialActions = mechSpecialActions.map((action, index) => ({
                id: `mech-special-${index}`,
                name: Utils.i18n(action.name),
                listName: `Action: ${Utils.i18n(action.name)}`,
                info1: { text: actionTypeLabel(mechActionTypes, action.actionType) },
                system: {
                    actionType: ACTION_TYPE.mechAction,
                    actionId: `special-${index}`,
                    category: 'special',
                    index
                }
            }));
            this.addActions(specialActions, { id: GROUP.mechSpecialActions.id });

            const gearActions = [];
            for (const item of this.actor.items) {
                const actions = item.system?.actions ?? [];
                for (let index = 0; index < actions.length; index++) {
                    const action = actions[index];
                    if (!action.name) continue;

                    const hasPPCost = action.ppCost !== null && action.ppCost !== undefined;
                    const label = hasPPCost
                        ? `${action.ppCost} PP`
                        : actionTypeLabel(mechActionTypes, action.actionType);

                    gearActions.push({
                        id: `mech-gear-${item.id}-${index}`,
                        name: `${action.name} (${item.name})`,
                        listName: `Action: ${action.name} (${item.name})`,
                        img: Utils.getImage(item),
                        info1: { text: label },
                        cssClass: !hasPPCost || currentPP >= action.ppCost ? '' : 'disabled',
                        system: {
                            actionType: ACTION_TYPE.mechAction,
                            actionId: `gear-${item.id}-${index}`,
                            category: 'gear',
                            itemId: item.id,
                            itemActionIndex: index
                        }
                    });
                }
            }
            this.addActions(gearActions.sort(byName), { id: GROUP.mechGearActions.id });
        }

        /**
         * Combat actions plus, while one is armed, the control that disarms a
         * damage level override and refunds the Power Points that bought it.
         */
        #buildMechUtility() {
            const actions = this.#combatActions();

            const override = this.actor.getFlag('sfrpg', 'damageLevelOverride');
            if (override) {
                actions.push({
                    id: 'cancelOverride',
                    name: game.i18n.format('tokenActionHud.sfrpg.cancelOverride', { source: override.source }),
                    listName: 'Action: Cancel Damage Override',
                    system: { actionType: ACTION_TYPE.cancelOverride, actionId: 'cancelOverride' }
                });
            }

            this.addActions(actions, { id: GROUP.utility.id });
        }

        /* ---------------------------------------------------------------- */
        /* Shared                                                           */
        /* ---------------------------------------------------------------- */

        /** With several tokens selected, only the combat actions still apply. */
        #buildCombatActions() {
            this.addActions(this.#combatActions(), { id: GROUP.utility.id });
        }

        /**
         * Initiative and End Turn, offered only while an encounter is running.
         *
         * @private
         * @returns {Array} Actions, empty when there is no encounter
         */
        #combatActions() {
            if (!game.combat) return [];

            const actions = [
                {
                    id: 'initiative',
                    name: Utils.i18n('tokenActionHud.sfrpg.rollInitiative'),
                    listName: 'Action: Roll Initiative',
                    system: { actionType: ACTION_TYPE.initiative, actionId: 'initiative' }
                }
            ];

            // End Turn is only offered to whoever is actually up. Showing it
            // otherwise invites a player to end someone else's turn.
            if (this.#isActorsTurn()) {
                actions.push({
                    id: 'endTurn',
                    name: Utils.i18n('tokenActionHud.sfrpg.endTurn'),
                    listName: 'Action: End Turn',
                    system: { actionType: ACTION_TYPE.endTurn, actionId: 'endTurn' }
                });
            }

            return actions;
        }

        /**
         * True only when an encounter has actually begun and the current
         * combatant is this token. A combat that exists but has not been started
         * has no current turn, so it is nobody's turn.
         *
         * @private
         */
        #isActorsTurn() {
            const combat = game.combat;
            if (!combat?.started) return false;

            const combatant = combat.combatant;
            if (!combatant) return false;

            // Match on the token first: an actor can have several tokens in the
            // encounter, and only the one whose turn it is should offer End Turn.
            if (this.token?.id) return combatant.tokenId === this.token.id;
            return !!this.actor && combatant.actorId === this.actor.id;
        }
    };
});

function byName(a, b) {
    return a.name.localeCompare(b.name);
}

/**
 * Keys already notified about this session.
 *
 * The HUD rebuilds on twenty-odd Foundry hooks, so a condition that holds for a
 * whole session would otherwise raise the same notification on every rebuild.
 */
const notified = new Set();

function notifyOnce(key, message) {
    if (notified.has(key)) return;
    notified.add(key);
    console.warn(message);
    ui.notifications.warn(message, { permanent: false });
}

/**
 * Label for a mech action's action type.
 *
 * An action with no type is constant rather than something spent on a turn, and
 * the mech sheet labels it that way, so an unrecognised type reads as constant
 * instead of leaving the badge blank.
 */
function actionTypeLabel(actionTypes, actionType) {
    const key = actionTypes?.[actionType] ?? 'SFRPG.MechSheet.Actions.ActionTypes.Constant';
    return game.i18n.localize(key);
}

function signed(value) {
    const number = value ?? 0;
    return number < 0 ? String(number) : `+${number}`;
}

/**
 * Skill label, with the profession's own name where it has one.
 *
 * Profession skills are keyed `pro`, `pro1`, `pro2`..., so the CONFIG lookup
 * takes the first three characters -- the same slice `rollSkillCheck()` uses.
 */
function skillName(id, skill) {
    const label = game.i18n.localize(CONFIG.SFRPG.skills[id.substring(0, 3)]);
    return skill.subname ? `${label} (${skill.subname})` : label;
}

/**
 * Ids of every item stored inside another item.
 *
 * The character sheet leaves contained spells out of the spellbook -- a spell
 * gem is not a prepared spell -- and the HUD's spell list follows it.
 */
function containedItemIds(actor) {
    const ids = new Set();
    for (const item of actor.items) {
        for (const entry of item.system?.container?.contents ?? []) {
            ids.add(entry.id);
        }
    }
    return ids;
}
