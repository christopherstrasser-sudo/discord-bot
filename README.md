# RAKU Discord Bot

Multi-user Discord bot with a web dashboard for per-server configuration.

## Current milestone

Version `0.1.0` contains the first working foundation:

- Discord bot connection via `discord.js`
- Express web dashboard
- Discord OAuth2 login (`identify` + `guilds`)
- Only guilds manageable by the logged-in user are shown
- Bot installation link per guild
- Detection whether the bot is already installed on a guild
- Windows start wrapper

## Requirements

- Node.js 20+
- A Discord application with a bot user

## Discord application setup

In the Discord Developer Portal configure the OAuth2 redirect URL:

```text
http://localhost:3000/auth/discord/callback
```

For a public installation replace `PUBLIC_BASE_URL` in `.env` with the public HTTPS URL and add the matching callback URL in Discord.

## First start on Windows

The Dev Bridge keeps the repository in:

```text
C:\Discord-Bot
```

Then run:

```text
C:\Discord-Bot\start.cmd
```

On first start the script creates `.env` and opens it in Notepad. Fill in:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
SESSION_SECRET=
```

Then run `start.cmd` again. Dependencies are installed automatically on the first real start.

Dashboard default URL:

```text
http://localhost:3000
```

Health endpoint:

```text
http://localhost:3000/health
```
