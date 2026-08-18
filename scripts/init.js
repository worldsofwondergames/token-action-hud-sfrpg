import { SystemManager } from './system-manager.js';
import { MODULE, REQUIRED_CORE_MODULE_VERSION } from './constants.js';

/**
 * Publishes this module's SystemManager to Token Action HUD Core.
 *
 * Everything this module does hangs off `tokenActionHudCoreApiReady`, which only
 * fires when Core is installed and active. With Core absent nothing here runs and
 * no class is even defined, so the module is inert rather than broken.
 */
Hooks.on('tokenActionHudCoreApiReady', async () => {
    const module = game.modules.get(MODULE.ID);
    module.api = {
        requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION,
        SystemManager
    };
    Hooks.call('tokenActionHudSystemReady', module);
});
