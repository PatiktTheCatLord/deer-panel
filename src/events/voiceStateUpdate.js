import { Events } from 'discord.js';
import { endVoiceSession, startVoiceSession } from '../utils/activity.js';

// Counts time spent in voice channels for /info (the AFK channel and bots are ignored).
export function isCountedVoice(state) {
  return Boolean(state.channelId) && state.channelId !== state.guild.afkChannelId && !state.member?.user.bot;
}

export default {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState) {
    const wasCounted = isCountedVoice(oldState);
    const isCounted = isCountedVoice(newState);
    if (wasCounted === isCounted) return; // moving between counted channels keeps the session running

    if (isCounted) startVoiceSession(newState.guild.id, newState.id);
    else endVoiceSession(oldState.guild.id, oldState.id);
  }
};
