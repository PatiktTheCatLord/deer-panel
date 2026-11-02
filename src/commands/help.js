import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { brand, showcaseWords } from '../utils/branding.js';
import { isEnabled } from '../utils/modules.js';
import { t } from '../i18n.js';

// [section title key, [module or null for core, text key]]; lines of modules that are off are left out.
const SECTIONS = [
  ['communityTitle', [['faq', 'faq'], ['activity', 'top'], ['showcase', 'showcase'], ['roles', 'roles']]],
  ['generalTitle', [[null, 'serverinfo'], [null, 'ping'], [null, 'help']]],
  ['staffWelcomeTitle', [['welcome', 'welcomeSetup'], ['welcome', 'welcomeOther'], ['welcome', 'autoroleSetup'], ['welcome', 'autoroleOther']]],
  ['staffToolsTitle', [['roles', 'rolesAdmin'], ['showcase', 'showcaseAdmin'], ['moderation', 'modlog'], ['faq', 'faqManage']]],
  ['staffModerationTitle', [[null, 'setup'], ['moderation', 'warn'], ['verification', 'verify'], ['stats', 'stats']]]
];

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays the list of commands and setup instructions.'),

  async execute(interaction) {
    const { guildId } = interaction;
    const { name, footer } = brand(guildId);
    const vars = { name, ...showcaseWords(guildId) };
    const fields = SECTIONS.map(([title, lines]) => ({
      name: t(guildId, `help.${title}`),
      value: lines.filter(([module]) => !module || isEnabled(guildId, module)).map(([, key]) => t(guildId, `help.${key}`, vars)).join('\n')
    })).filter(field => field.value);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(t(guildId, 'help.title', { name }))
      .setDescription(t(guildId, 'help.intro'))
      .addFields(fields)
      .setFooter({ text: footer })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
