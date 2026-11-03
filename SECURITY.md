# Security Policy

## Supported versions

Only the latest version on the `main` branch gets security fixes.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

- Use GitHub's **private vulnerability reporting**: the repository's **Security** tab →
  **Report a vulnerability**.
- If that isn't possible, ask a moderator on our [Discord server](https://discord.gg/hucz7bACBc)
  for a private channel. Don't post details in public channels.

Include what is affected (bot, panel or admin API), how to reproduce it and what an attacker could
do. We'll answer within a week and tell you when a fix is released. Credit is given in the release
notes unless you'd rather stay anonymous.

## Keeping your bot safe

- **Your bot token is a password.** Never share it, post it in screenshots or commit `.env`. If it
  ever leaks, reset it right away: Developer Portal → **Bot** → **Reset Token**.
- Keep `ADMIN_API_TOKEN` long and random (`.env.example` shows how to generate one). The admin API
  listens on `127.0.0.1` only; don't expose its port to the internet. The panel reaches it through
  SSH.
- On a server, use SSH keys, keep the system updated and keep `.env` readable by the bot user only
  (`deploy/deploy-vds.sh` sets `chmod 600`).
- Set a PIN in the panel if other people use your computer.
- Give the bot only the permissions it needs, and keep its role below your staff roles.
- Addons run with all of the bot's rights. Only install addons whose code you have read or whose
  author you trust.
