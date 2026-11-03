// Example Deer Panel addon. Copy this folder to addons/<your-id>/, change addon.json, restart the bot.
// Everything discord.js offers is available: import it like the bot's own code does.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, MessageFlags, SlashCommandBuilder } from 'discord.js';

// The bot calls this once at startup with a context for this addon:
//   context.data.get(guildId) / context.data.set(guildId, value)  small JSON store per server
//   context.log(...) / context.error(...)                          log lines with the addon's name
//   context.isEnabled(guildId)                                     is the addon on for that server
export default context => ({
  commands: [
    {
      data: new SlashCommandBuilder().setName('hello').setDescription('Says hello and counts how often it was used here.'),

      async execute(interaction) {
        const data = context.data.get(interaction.guildId);
        const count = (data.count ?? 0) + 1;
        context.data.set(interaction.guildId, { ...data, count });

        // Buttons use customIds that start with the command name: "<command>:<action>".
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('hello:wave').setLabel('Wave back').setEmoji('👋').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: `Hello, ${interaction.user}! /hello was used ${count} time(s) on this server.`, components: [row] });
      },

      async handleButton(interaction) {
        if (interaction.customId === 'hello:wave') {
          await interaction.reply({ content: `${interaction.user} waves back! 👋`, flags: MessageFlags.Ephemeral });
        }
      }
    }
  ],

  events: [
    {
      name: Events.MessageCreate,
      async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (/^(hello|hi|merhaba)[!. ]*$/i.test(message.content)) await message.react('👋').catch(() => {});
      }
    }
  ]
});
