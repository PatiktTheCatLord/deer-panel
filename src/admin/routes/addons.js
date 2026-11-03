import { ADDONS_DIR, addonKey, listAddons } from '../../utils/addons.js';
import { isEnabled } from '../../utils/modules.js';

// Addons the bot loaded at startup (utils/addons.js). They are switched on or off like modules
// (PATCH /api/modules with "addon:<id>"); the panel installs and removes their folders itself.
function list({ guild }) {
  return {
    dir: ADDONS_DIR,
    addons: listAddons().map(addon => ({ ...addon, key: addonKey(addon.id), enabled: !addon.error && isEnabled(guild.id, addonKey(addon.id)) }))
  };
}

export default [['GET', /^\/api\/addons$/, list]];
