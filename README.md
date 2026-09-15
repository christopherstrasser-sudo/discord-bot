# RAKU Discord Bot

Multi-user Discord bot with a web dashboard for per-server configuration.

## Current milestone

Version `0.7.0` contains the working multi-server foundation, the RAKU Control Deck UI, server logging, the Command Flow Builder and the first complete Role Studio:

- Discord bot connection via `discord.js`
- Express web dashboard
- Discord OAuth2 login (`identify` + `guilds`)
- Only guilds manageable by the logged-in user are shown
- Bot installation link per guild
- Detection whether the bot is already installed on a guild
- Per-server settings for Welcome, Auto-Role, Logging, Custom Commands and Role Studio
- Live Welcome preview and clickable message variables
- Writable-channel and manageable-role capability checks
- Test-message tool per guild
- Welcome and Auto-Role execution on member join
- Structured server logs for Join / Leave
- Message Edit / Delete logs including message content when available
- Member role, nickname and timeout changes
- Role create / update / delete logs
- Channel create / update / delete logs
- Ban / Unban logs
- Command Flow Builder with text, embed, link-button and random blocks
- Per-command enable/disable, cooldown, reply/send mode and response variables
- Runtime execution for `!commands` with per-user cooldowns
- Role Studio with multiple panels per server
- Button Roles, Dropdown Roles and Reaction Roles
- Single-choice and multi-role panel behavior
- Live Discord preview, templates and role import
- Publish / update / unpublish of role panels directly from the dashboard
- Runtime role assignment with hierarchy and permission checks
- Windows start wrapper

## Custom Command variables

- `{user}` - mentions the user
- `{username}` - Discord username
- `{displayName}` - server display name
- `{server}` - server name
- `{channel}` - current channel
- `{args}` - everything entered after the command

## Role Studio

Role Studio supports up to 10 panels per server and 20 role entries per panel.

Available panel modes:

- Buttons
- Dropdown / Select Menu
- Emoji Reactions

Panels can be configured as single-choice or multi-role groups. Existing published messages can be updated from the dashboard, and the bot checks channel permissions and the Discord role hierarchy before publishing or assigning roles.

## Requirements

- Node.js 20+
- A Discord application with a bot user
- `SERVER MEMBERS INTENT` enabled in Discord Developer Portal
- `MESSAGE CONTENT INTENT` enabled in Discord Developer Portal for message logs and Custom Commands

`Guild Message Reactions` is used for Reaction Roles and is not a privileged Discord intent.

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
