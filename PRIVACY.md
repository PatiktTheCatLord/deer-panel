# Privacy

Deer Panel is self-hosted. Every copy of the bot is run by the person who set it up (the **bot
owner**), with their own bot token, on their own computer or server. The authors of this project
don't run your bot, don't receive any of its data and have no access to it. There is no telemetry.

This note describes what the software stores, so bot owners can tell their members. If you run a
bot for a server, **you** are responsible for that data and for answering your members' requests.

## What the bot stores

Everything is kept in plain files next to the bot: `data/settings.json` and `logs/`, plus nightly copies in `backups/` (the newest 14 are kept). Nothing is sent anywhere
except to Discord and, if you turn on stream alerts, to Twitch, Kick and YouTube to check whether
the channels you chose are live.

Per server, depending on which modules are on:

| Data | What exactly | Module |
|---|---|---|
| Server settings | channel and role IDs, texts, language, module switches | all |
| Warnings | member ID, reason, moderator ID, date | Moderation |
| Moderation actions | bans, kicks, timeouts from the audit log: member and moderator IDs, reason, duration | Mod log |
| Member activity | message count, active days, channels, voice minutes, last message time, joins and leaves (counts and dates, **no message text**) | Stats / `/info` |
| Owner notes | private notes about a member, author ID, date | `/note` |
| Showcase | weekly winners and win counts | Showcase |
| Daily history | joins, leaves and member count per day (no IDs) | Stats |
| Addon data | whatever installed addons save for the server, under `addonData` | Addons |

**Addons** you install are code written by other people. They run with all of the bot's rights and
can store or send data of their own; this note only covers the bot itself. Check what an addon does
before you install it.

**Message text** is not stored in `data/`. When a message is deleted or edited, the mod log posts it to your mod log channel, and a
short line with its first 150 characters goes to the bot's log (`logs/` or the system journal).

Members are stored by their Discord ID. User names are not saved in `data/`; they appear only in
the bot's log lines (for example "role given to …"). The panel
shows names and avatars by asking Discord when it needs them; it doesn't copy profiles into files.

## What the panel stores

On the Windows computer it runs on (Electron's user data folder): connection profiles (server
address, user name, bot folder; passwords and SSH key passphrases encrypted with Windows), an
optional PIN (hashed), panel settings and a history of actions taken in the panel. If the bot runs
on this computer, its `data/` folder is there too.

## Deleting data

- **One member:** remove their warnings and notes with the bot's commands or in the panel
  (Members). Their records can also be removed by hand from `data/settings.json` while the
  bot is stopped.
- **One server:** remove the server's entry from `data/settings.json` while the bot is stopped.
- **Everything:** stop the bot and delete `data/`, `logs/` and `backups/`.

Remember that nightly backups still contain the old data for up to 14 days.
