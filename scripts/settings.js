import { MODULE } from './constants.js';

/**
 * Registered by SystemManager.registerSettings(). Both settings are client-scoped
 * so each player controls their own HUD density.
 *
 * @param {function} onChangeFunction Supplied by Token Action HUD Core; rebuilds
 *                                    the HUD when a setting changes.
 */
export function register(onChangeFunction) {
    game.settings.register(MODULE.ID, 'showUntrainedSkills', {
        name: game.i18n.localize('tokenActionHud.sfrpg.settings.showUntrainedSkills.name'),
        hint: game.i18n.localize('tokenActionHud.sfrpg.settings.showUntrainedSkills.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            onChangeFunction(value);
        }
    });

    game.settings.register(MODULE.ID, 'showUnequippedItems', {
        name: game.i18n.localize('tokenActionHud.sfrpg.settings.showUnequippedItems.name'),
        hint: game.i18n.localize('tokenActionHud.sfrpg.settings.showUnequippedItems.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            onChangeFunction(value);
        }
    });
}
