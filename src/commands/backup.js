import fs from 'node:fs';
import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { BACKUP_DIR, SETTINGS_FILE } from '../utils/storage.js';
import { flushActivity } from '../utils/stats.js';
import { discordTimestamp } from '../utils/helpers.js';
import { t } from '../i18n.js';

// Sends the bot's data file (settings, warnings, notes…) only to the owner.
export default {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Sends you a copy of all bot data (owner only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    // Write the counters kept in memory first, so the copy is complete.
    flushActivity();

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const file = new AttachmentBuilder(fs.readFileSync(SETTINGS_FILE), { name: `deer-panel-backup-${stamp}.json` });

    const nightly = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(name => name.startsWith('settings-') && name.endsWith('.json.gz')).sort()
      : [];
    const newest = nightly.at(-1);
    const nightlyText = nightly.length
      ? t(interaction.guildId, 'cmd.backup.nightlyBackupsOnThe', { length: nightly.length, slice: newest.slice(9, 19), discordTimestamp: discordTimestamp(fs.statSync(`${BACKUP_DIR}/${newest}`).mtime, 'R') })
      : t(interaction.guildId, 'cmd.backup.noNightlyBackupsOn');

    return interaction.reply({
      content: t(interaction.guildId, 'cmd.backup.hereIsACopy', { nightlyText }),
      files: [file],
      flags: MessageFlags.Ephemeral
    });
  }
};
