import { ACTION_TYPE, MODULE } from './constants.js';

export let RollHandler = null;

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    RollHandler = class RollHandler extends coreModule.api.RollHandler {
        /**
         * Called by Token Action HUD Core when an action is clicked.
         *
         * Core 2.1 supplies the action on `this.action.system` and the resolved
         * actor/token on `this.actor` / `this.token`. There is no encodedValue
         * argument -- that format was deprecated in 2.0 and is gone from current
         * system modules.
         *
         * @override
         * @param {Event} event
         */
        async handleActionClick(event) {
            if (this.actor) {
                await this.#handleAction(event, this.actor, this.token);
                return;
            }

            // Several tokens selected: Core empties `actor` and fills `tokens`.
            for (const token of this.tokens ?? []) {
                if (token?.actor) await this.#handleAction(event, token.actor, token);
            }
        }

        /**
         * Every branch calls an existing Starfinder entry point rather than
         * reimplementing a roll, so a HUD roll behaves exactly like the same roll
         * from the sheet -- roll dialog, modifiers, trained-only prompt, spell
         * slot dialog and chat card included.
         *
         * @private
         */
        async #handleAction(event, actor, token) {
            const { actionType, actionId } = this.action.system;

            switch (actionType) {
                case ACTION_TYPE.ability:
                    return actor.rollAbility(actionId, { event });

                case ACTION_TYPE.save:
                    return actor.rollSave(actionId, { event });

                case ACTION_TYPE.skill:
                    return actor.rollSkill(actionId, { event });

                case ACTION_TYPE.attack:
                    return this.#withItem(actor, actionId, item => item.rollAttack({ event }));

                case ACTION_TYPE.damage:
                    return this.#withItem(actor, actionId, item => item.rollDamage({ event }));

                case ACTION_TYPE.item:
                    return this.#withItem(actor, actionId, item => this.#useItem(item, event));

                case ACTION_TYPE.spell:
                    return this.#withItem(actor, actionId, item => actor.useSpell(item));

                case ACTION_TYPE.feat:
                    return this.#withItem(actor, actionId, item => item.roll());

                case ACTION_TYPE.missionPod:
                    return this.#togglePod(actor, actionId);

                case ACTION_TYPE.mechAction:
                    return this.#mechAction(actor);

                case ACTION_TYPE.cancelOverride:
                    await actor.cancelMechDamageOverride();
                    return Hooks.callAll('forceUpdateTokenActionHud');

                case ACTION_TYPE.initiative:
                    return this.#rollInitiative(actor, token);

                case ACTION_TYPE.endTurn:
                    return this.#endTurn(token);

                case ACTION_TYPE.shortRest:
                    return actor.shortRest();

                case ACTION_TYPE.longRest:
                    return actor.longRest();

                default:
                    console.warn(`${MODULE.ID}: no handler for action type "${actionType}"`);
            }
        }

        /**
         * Resolve an item and run `callback` on it.
         *
         * A right-click opens the item's sheet instead, which is the gesture Core
         * uses for this across system modules.
         *
         * @private
         */
        async #withItem(actor, itemId, callback) {
            const item = actor.items.get(itemId);
            if (!item) {
                console.warn(`${MODULE.ID}: item ${itemId} not found on ${actor.name}`);
                return;
            }

            if (this.isRenderItem()) return item.sheet.render(true);
            return callback(item);
        }

        /**
         * Items with charges or a capacity are spent through `useItem()`, which
         * deducts the charge and posts the activation card. Anything else has
         * nothing to spend, and `useItem()` would refuse it as having no uses --
         * so those post their own item card instead.
         *
         * @private
         */
        async #useItem(item, event) {
            if (item.canBeUsed() || item.hasCapacity()) return item.useItem({ event });
            return item.roll();
        }

        /**
         * Mission pods hold state, so the HUD has to be rebuilt afterwards for
         * the action's label to flip.
         *
         * @private
         */
        async #togglePod(actor, itemId) {
            const pod = actor.items.get(itemId);
            if (!pod) {
                console.warn(`${MODULE.ID}: mission pod ${itemId} not found on ${actor.name}`);
                return;
            }

            const changed = await actor.setMissionPodActive(pod.id, !pod.system.isActive);
            if (changed) Hooks.callAll('forceUpdateTokenActionHud');
        }

        /**
         * Power Point, Special and Gear actions all run through the actor, which
         * owns the PP arithmetic and the damage level override.
         *
         * @private
         */
        async #mechAction(actor) {
            const { category, index, itemId, itemActionIndex } = this.action.system;

            await actor.useMechAction(category, index, { itemId, itemActionIndex });

            // Spending PP or arming an override changes what the Actions and
            // Utility tabs should offer.
            Hooks.callAll('forceUpdateTokenActionHud');
        }

        /** @private */
        async #rollInitiative(actor, token) {
            if (!game.combat) return;

            const combatant = game.combat.combatants.find(c =>
                (token && c.tokenId === token.id) || c.actorId === actor.id);
            if (!combatant) {
                ui.notifications.warn(`${actor.name} is not in the current encounter.`);
                return;
            }

            await game.combat.rollInitiative([combatant.id]);
            Hooks.callAll('forceUpdateTokenActionHud');
        }

        /** @private */
        async #endTurn(token) {
            if (!game.combat) return;
            if (token && game.combat.current?.tokenId !== token.id) return;
            await game.combat.nextTurn();
        }
    };
});
