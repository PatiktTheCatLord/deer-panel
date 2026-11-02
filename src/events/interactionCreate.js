import { Events, MessageFlags } from 'discord.js';
import { canUseCommand } from '../utils/permissions.js';
import { commandEnabled } from '../utils/modules.js';
import { t } from '../i18n.js';

async function replyWithError(interaction) {
  const errorMessage = {
    content: t(interaction.guildId, 'common.error'),
    flags: MessageFlags.Ephemeral
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(errorMessage).catch(() => {});
  } else {
    await interaction.reply(errorMessage).catch(() => {});
  }
}

// Picks the command module and the method that should handle this interaction.
// Buttons and modals use customIds shaped like "<command name>:<action>[:extra...]".
function resolveHandler(interaction) {
  const commands = interaction.client.commands;

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    return { label: `/${interaction.commandName}`, command, handler: command?.execute };
  }
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    return { label: `autocomplete /${interaction.commandName}`, command, handler: command?.autocomplete };
  }

  const [commandName] = interaction.customId?.split(':') ?? [];
  const command = commands.get(commandName);
  if (interaction.isModalSubmit()) {
    return { label: `modal ${interaction.customId}`, command, handler: command?.handleModal };
  }
  if (interaction.isButton()) {
    return { label: `button ${interaction.customId}`, command, handler: command?.handleButton };
  }
  return null;
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const resolved = resolveHandler(interaction);
    if (!resolved) return;

    const { label, command, handler } = resolved;
    // Commands are server-only (see commandPayload); old clients could still send one from a DM.
    if (!interaction.inGuild()) return;
    if (!handler) {
      console.warn(`[WARN] No handler found for ${label}.`);
      return;
    }

    // Staff and owner-only commands: checked here so no command can forget it (panel → Permissions).
    if ((interaction.isChatInputCommand() || interaction.isAutocomplete()) && !canUseCommand(interaction, command)) {
      console.warn(`[PERMISSIONS] ${interaction.user.tag} tried to use ${label}.`);
      if (interaction.isAutocomplete()) return interaction.respond([]).catch(() => {});
      return interaction.reply({ content: t(interaction.guildId, command.ownerOnly ? 'common.ownerOnly' : 'common.noPermission'), flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Modules switched off on this server (their commands are also removed from the server's list).
    if (interaction.inGuild() && !commandEnabled(interaction.guildId, command.data.name)) {
      if (interaction.isAutocomplete()) return interaction.respond([]).catch(() => {});
      return interaction.reply({ content: t(interaction.guildId, 'common.moduleOff'), flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    try {
      await handler(interaction);
    } catch (error) {
      console.error(`Error handling ${label}:`, error);
      // Autocomplete interactions can't receive messages.
      if (!interaction.isAutocomplete()) await replyWithError(interaction);
    }
  }
};
