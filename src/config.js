// Central place for branding, colors and tunable defaults.

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  neutral: 0x99aab5,
  blurple: 0x5865f2,
  orange: 0xf0a020,
  purple: 0x9b59b6
};

// Showcase wording for new servers (changeable in the panel): what members post, and the weekly winner.
export const DEFAULT_SHOWCASE_WORDS = { item: 'creation', title: 'Pick of the Week' };

// Permissions the bot needs in the welcome channel.
export const WELCOME_CHANNEL_PERMISSIONS = ['ViewChannel', 'SendMessages', 'EmbedLinks'];

// Permissions the bot needs in the mod-log channel.
export const MOD_LOG_CHANNEL_PERMISSIONS = ['ViewChannel', 'SendMessages', 'EmbedLinks'];

// Permissions the bot needs in the showcase channel.
export const SHOWCASE_CHANNEL_PERMISSIONS = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AddReactions', 'ReadMessageHistory'];

// Self-role panel: Discord allows at most 5 rows of 5 buttons.
export const MAX_SELF_ROLES = 25;

export const SHOWCASE = {
  reaction: '❤️',
  // The weekly showcase winner is picked every Sunday at 18:00 UTC (weekday: 0 = Sunday).
  pickWeekday: 0,
  pickHourUtc: 18,
  // Only posts from the last 7 days take part in the vote.
  windowDays: 7
};

// New accounts younger than this are flagged in the join log.
export const NEW_ACCOUNT_WARNING_DAYS = 7;

export const MAX_FAQS = 25;

export const WARNINGS = {
  // Defaults; the desktop panel can change them (utils/botConfig.js).
  // At this many active warnings within `windowDays` the staff is alerted. There is no automatic punishment.
  threshold: 3,
  windowDays: 30
};

// Weekly staff report: every Monday at 09:00 UTC (weekday: 1 = Monday).
export const STATS_REPORT = {
  weekday: 1,
  hourUtc: 9
};

// Server-wide permissions the bot needs for all features (checked by /setup).
export const REQUIRED_BOT_PERMISSIONS = [
  'ManageRoles',
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
  'AddReactions',
  'CreatePublicThreads',
  'SendMessagesInThreads',
  'ViewAuditLog',
  'MentionEveryone',
  'ModerateMembers'
];
