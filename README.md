# RAKU Discord Bot

Multi-user Discord bot with a web dashboard for per-server configuration.

## Current milestone

Version `0.3.0` contains the working multi-server foundation and the redesigned Discord-inspired control center:

- Discord bot connection via `discord.js`
- Express web dashboard
- Discord OAuth2 login (`identify` + `guilds`)
- Only guilds manageable by the logged-in user are shown
- Bot installation link per guild
- Detection whether the bot is already installed on a guild
- Per-server settings for Welcome, Auto-Role, Logging and Custom Commands
- Live Welcome preview and clickable message variables
- Writable-channel and manageable-role capability checks
- Test-message tool per guild
- Windows start wrapper

## Requirements

- Node.js 20+
- A Discord application with a bot user
- `SERVER MEMBERS INTENT` enabled in Discord Developer Portal for Welcome / Auto-Role

## Discord application setup

OAuth2 redirect URL for the current server deployment:

```text
http://31.70.115.79:3000/auth/discord/callback
```

The same base URL must be configured in `.env`:

```env
PUBLIC_BASE_URL=http://31.70.115.79:3000
```

## Windows start

The Dev Bridge keeps the repository in:

```text
C:\Discord-Bot
```

Start with:

```text
C:\Discord-Bot\start.cmd
```

Required local `.env` values:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
SESSION_SECRET=
```

Dashboard:

```text
http://31.70.115.79:3000
```

Health endpoint:

```text
http://31.70.115.79:3000/health
```
