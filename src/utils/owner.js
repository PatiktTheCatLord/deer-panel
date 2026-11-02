// Owner-only commands are allowed for the user IDs in OWNER_IDS (comma-separated, in .env).
// When OWNER_IDS is empty, the server owner is allowed.
const ownerIds = (process.env.OWNER_IDS ?? '')
  .split(',')
  .map(id => id.trim())
  .filter(id => /^\d{17,20}$/.test(id));

export function isOwner(interaction) {
  if (ownerIds.length) return ownerIds.includes(interaction.user.id);
  return interaction.guild?.ownerId === interaction.user.id;
}
