# RAKU Discord Bot

Multi-user Discord bot with a web dashboard for per-server configuration.

## Current milestone

Version `0.2.0` contains:

- Discord bot connection via `discord.js`
- Express web dashboard
- Discord OAuth2 login (`identify` + `guilds`)
- Only guilds manageable by the logged-in user are shown
- Bot installation link per guild
- Detection whether the bot is already installed on a guild
- Persistent per-guild settings
- Welcome module
- Auto-Role module
- Server logging configuration foundation
- Custom Commands module foundation
- Windows start wrapper

## Requirements

- Node.js 20+
- A Discord application with a bot user

## Discord application setup

OAuth2 redirect URL:

```text
http://31.70.115.79:3000/auth/discord/callback
```

For the website login use the scopes:

```text
identify
guilds
```

For server installation use:

```text
bot
applications.commands
```

### Required Gateway Intent

The Welcome and Auto-Role modules react to new members joining a server. Therefore the Discord application must have this privileged intent enabled:

```text
Developer Portal -> Bot -> Privileged Gateway Intents -> Server Members Intent = ON
```

The bot requests `Guilds` and `GuildMembers` at runtime. If Server Members Intent is disabled in the Developer Portal, Discord will reject the gateway connection after the next restart.

## First start on Windows

The Dev Bridge keeps the repository in:

```text
C:\Discord-Bot
```

Run:

```text
C:\Discord-Bot\start.cmd
```

The local `.env` contains the Discord credentials and is intentionally ignored by Git.

Dashboard:

```text
http://31.70.115.79:3000
```

Health endpoint:

```text
http://31.70.115.79:3000/health
```

## Welcome placeholders

The Welcome message currently supports:

```text
{user}
{username}
{displayName}
{server}
{memberCount}
```

`{user}` creates a safe mention of the joining member. Other mentions from custom text are not automatically expanded.
