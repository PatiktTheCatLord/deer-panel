# Writing addons

An addon adds your own features to the bot (slash commands, buttons, reactions to Discord events)
without changing the bot's code. Addons live in the bot's `addons/` folder, so updates never touch
them, and each one can be switched on or off per server in the panel (**Addons** page).

## Quick start

1. Copy [`examples/addons/hello-world`](examples/addons/hello-world) and give the copy a new name, for
   example `my-addon`.
2. Open `addon.json` and set `"id"` to the same name as the folder.
3. Change `index.js`.
4. Install it: panel → **Addons** → **Install from folder** (or zip the folder and use **Install from zip**).
   Running the bot by hand? Put the folder in `addons/` next to `src/` and restart the bot.

`npm run check` builds the bot's commands and every addon in `addons/` without logging in. Run it
before you share an addon: it shows why an addon can't be loaded.

## The folder

```
addons/
└── my-addon/
    ├── addon.json
    └── index.js
```

### `addon.json`

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "description": "What it does, in one sentence.",
  "author": "Your name",
  "homepage": "https://github.com/you/my-addon",
  "main": "index.js"
}
```

| Field | Needed | Notes |
|---|---|---|
| `id` | yes | Same as the folder name. `a-z`, `0-9` and `-`, 2 to 40 characters |
| `name` | no | Shown in the panel (default: the id) |
| `version`, `description`, `author`, `homepage` | no | Shown in the panel |
| `main` | no | The file the bot imports (default `index.js`), inside the folder |

### `index.js`

An ES module (`import`/`export`) whose default export is an object, or a function that gets a
context and returns the object:

```js
import { Events, SlashCommandBuilder } from 'discord.js';

export default context => ({
  commands: [
    {
      data: new SlashCommandBuilder().setName('dice').setDescription('Rolls a die.'),
      async execute(interaction) {
        await interaction.reply(`🎲 ${1 + Math.floor(Math.random() * 6)}`);
      }
    }
  ],
  events: [
    {
      name: Events.GuildMemberAdd,
      async execute(member) {
        context.log(`${member.user.username} joined ${member.guild.name}`);
      }
    }
  ]
});
```

`discord.js` comes with the bot; import it like the bot's own code does.

## Commands

Each command is an object like the bot's own files in `src/commands/`:

| Property | |
|---|---|
| `data` | A `SlashCommandBuilder` (name, description, options) |
| `execute(interaction)` | Runs the slash command |
| `autocomplete(interaction)` | Optional: autocomplete for options with `.setAutocomplete(true)` |
| `handleButton(interaction)` | Optional: buttons whose `customId` starts with `<command name>:` |
| `handleModal(interaction)` | Optional: modals whose `customId` starts with `<command name>:` |

- A command name can't be one the bot (or another addon) already uses.
- Staff-only commands: use `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` (or another
  permission). Discord then hides the command from everyone else.
- The bot registers commands by itself on every start. Addon commands also show up in `/help`, with
  their description.
- When the addon is switched off on a server, its commands answer "turned off" there (or disappear,
  with `COMMAND_MODE=server`).

## Events

Each event is `{ name, execute, once? }`; `name` is a discord.js event (`Events.MessageCreate`,
`Events.GuildMemberAdd`, …). The bot already has the intents for members, messages (with content),
reactions, voice states, moderation and AutoMod.

Events that belong to a server only run where the addon is on. An error inside `execute` is logged
with the addon's name and doesn't crash the bot.

## The context

| | |
|---|---|
| `context.id` | The addon's id |
| `context.log(...)`, `context.error(...)` | Log lines starting with `[ADDON <id>]` (panel → Logs) |
| `context.isEnabled(guildId)` | Whether the addon is on for that server (for timers and schedulers) |
| `context.data.get(guildId)` | The addon's saved data for that server (an object, `{}` at first) |
| `context.data.set(guildId, value)` | Saves it (plain JSON: objects, lists, strings, numbers) |

Data is saved in the bot's `data/settings.json` under `addonData.<id>` and is included in backups.
Keep it small: it's read and written as a whole. Removing an addon keeps its data.

## Tips

- **Extra npm packages:** put them in the addon folder (`npm install <package>` inside it creates
  `node_modules/` there) and ship the folder with them. Only pure JavaScript packages work on every
  machine; packages with native code built on Windows won't run on a Linux server.
- **Timers:** start them in the default export function and check `context.isEnabled(guildId)`
  before doing something on a server.
- **Translations:** addons are not part of the bot's language files. Write your texts in the
  language of your server.
- **Size:** the panel accepts addons up to 50 MB.

## Security

An addon runs inside the bot with everything the bot can do: it can read messages, use the bot
token, change the bot's data and moderate members. Only install addons whose code you have read or
whose author you trust. Never paste someone's addon without looking at what it does.
