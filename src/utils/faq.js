import { getGuildSettings } from './storage.js';
import { truncate } from './helpers.js';

export function getFaqs(guildId) {
  return getGuildSettings(guildId).faqs;
}

// Autocomplete for the "topic" option: matches the typed text against the questions.
export async function respondWithFaqTopics(interaction) {
  const typed = interaction.options.getFocused().toLowerCase();
  const choices = Object.entries(getFaqs(interaction.guildId))
    .filter(([, faq]) => faq.question.toLowerCase().includes(typed))
    .sort(([, a], [, b]) => (b.uses ?? 0) - (a.uses ?? 0))
    .slice(0, 25)
    .map(([id, faq]) => ({ name: truncate(faq.question, 100), value: id }));

  await interaction.respond(choices);
}
