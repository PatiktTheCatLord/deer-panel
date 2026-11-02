# Third-Party Notices

Deer Panel (the bot and the desktop panel) is licensed under the GNU AGPL-3.0 (see `LICENSE`). It includes or
depend on the third-party works below, which keep their own licenses.

## Icons: Lucide

The panel's interface icons (the `<symbol>` sprite in `panel/renderer/index.html`) are drawn from
or based on [Lucide](https://lucide.dev), used under the ISC License:

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without
fee is hereby granted, provided that the above copyright notice and this permission notice appear
in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

Feather portions are under the MIT License, Copyright (c) 2013-2022 Cole Bemis.

## npm dependencies

These are installed by `npm install` and, for the packaged panel, shipped inside `node_modules/`
together with their own license files.

| Package | Used by | License |
|---|---|---|
| [discord.js](https://github.com/discordjs/discord.js) | bot | Apache-2.0 |
| [dotenv](https://github.com/motdotla/dotenv) | bot | BSD-2-Clause |
| [ssh2](https://github.com/mscdex/ssh2) | panel | MIT |
| [Electron](https://github.com/electron/electron) | panel | MIT |
| [@electron/packager](https://github.com/electron/packager) | panel (build only) | BSD-2-Clause |

Their transitive dependencies are listed in `package-lock.json` and `panel/package-lock.json`,
each with its `license` field.
