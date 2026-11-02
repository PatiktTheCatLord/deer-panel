# Contributing

Thanks for wanting to help! Bug reports, ideas and pull requests are all welcome.

## Before you open a pull request

- Talk to us first for anything bigger than a small fix: open an issue or ask on our
  [Discord server](https://discord.gg/hucz7bACBc), so nobody builds something that can't be merged.
- Keep user-facing text in both languages: English in the code, Turkish in `src/locales/` and
  `panel/renderer/i18n.js`. `npm run check:locales` lists missing Turkish texts.
- Run `npm run check` (validates every slash command) before you push.
- Never commit `.env`, `data/`, logs, tokens, server addresses or member IDs.

## Contributor License Agreement (CLA)

Deer Panel (the bot and the desktop panel) is published under the GNU AGPL-3.0, and the author also offers it under
a separate commercial license (see the **License** section of the README). To keep that possible,
every contribution needs this agreement. By opening a pull request you confirm:

1. **You can give it.** The contribution is your own work, or you have the right to submit it, and
   it doesn't include code under a license that is incompatible with the AGPL-3.0.
2. **You keep your copyright**, and you grant the project author (PatiktTheCatLord) a perpetual,
   worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, modify, sublicense and
   distribute your contribution, under the AGPL-3.0 **and under any other license, including
   commercial ones**.
3. **Patents.** If your contribution is covered by a patent you hold, you grant the same rights for
   that patent, for use of the contribution as part of this project.
4. **No warranty.** You provide the contribution as is, and you aren't required to support it.

Please add this line to your pull request description:

> I have read the CLA in CONTRIBUTING.md and agree to it.

Pull requests without it can't be merged.
