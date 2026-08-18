import { ActionHandler } from './action-handler.js';
import { RollHandler as Core } from './roll-handler.js';
import { DEFAULTS } from './defaults.js';
import * as systemSettings from './settings.js';

export let SystemManager = null;

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    SystemManager = class SystemManager extends coreModule.api.SystemManager {
        /** @override */
        getActionHandler() {
            return new ActionHandler();
        }

        /** @override */
        getAvailableRollHandlers() {
            return { core: 'Core Starfinder' };
        }

        /** @override */
        getRollHandler(rollHandlerId) {
            switch (rollHandlerId) {
                case 'core':
                default:
                    return new Core();
            }
        }

        /** @override */
        registerSettings(onChangeFunction) {
            systemSettings.register(onChangeFunction);
        }

        /** @override */
        async registerDefaults() {
            return DEFAULTS;
        }
    };
});
