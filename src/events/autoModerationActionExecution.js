import { AutoModerationActionType, AutoModerationRuleTriggerType, Events } from 'discord.js';
import { getBotConfig } from '../utils/botConfig.js';
import { addWarning } from '../utils/moderation.js';
import { isEnabled } from '../utils/modules.js';
import { t } from '../i18n.js';

const TRIGGER_NAMES = {
  [AutoModerationRuleTriggerType.Keyword]: 'Blocked words',
  [AutoModerationRuleTriggerType.Spam]: 'Spam',
  [AutoModerationRuleTriggerType.KeywordPreset]: 'Blocked words',
  [AutoModerationRuleTriggerType.MentionSpam]: 'Mention spam'
};

// When AutoMod blocks a message, the author automatically gets a warning (no automatic punishment;
// the staff is alerted at the warning alert level). Can be switched off in the desktop panel.
export default {
  name: Events.AutoModerationActionExecution,
  async execute(execution) {
    // One AutoMod hit fires an event per action (block, alert, …): react to the block only, so it's one warning.
    if (execution.action.type !== AutoModerationActionType.BlockMessage) return;
    const { guild } = execution;
    if (!isEnabled(guild.id, 'moderation') || !getBotConfig(guild.id).autoModWarnings) return;

    const member = await guild.members.fetch(execution.userId).catch(() => null);
    if (!member || member.user.bot) return;

    const rule = await guild.autoModerationRules.fetch(execution.ruleId).catch(() => null);
    const ruleName = rule?.name ?? TRIGGER_NAMES[execution.ruleTriggerType] ?? t(guild.id, 'event.autoModerationActionExecution.automodRule');
    const reason = t(guild.id, 'event.autoModerationActionExecution.automod', { ruleName, value: execution.matchedKeyword ? ` (“${execution.matchedKeyword}”)` : '' });

    await addWarning(guild, member, reason.slice(0, 500), { moderatorId: guild.client.user.id, via: 'AutoMod' });
    console.log(`[AUTOMOD] Warning added to ${member.user.tag}: ${reason}`);
  }
};
