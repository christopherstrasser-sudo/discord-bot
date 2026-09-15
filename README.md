# RAKU Discord Bot

Multi-user Discord bot with web dashboard.

## Development

- Node.js 20+
- Dashboard and bot start together via `start.cmd`
- Discord OAuth scopes: `identify guilds`
- Bot install scopes: `bot applications.commands`
- Privileged intents required: `Server Members Intent` and `Message Content Intent`

## Current modules

- Welcome
- Auto-Role
- Server Logs
- Custom Commands / Flow Builder
- Role Studio with Buttons, Dropdowns and Reaction Roles

## Role Studio

Role Studio supports multiple panels per guild, live previews, publish/update/unpublish, exclusive or multi-role selection and an integrated emoji picker.

Component emoji publishing is fault-tolerant: if Discord rejects a specific Unicode emoji for a button/select component, the affected emoji is removed from that one role entry and the panel is retried automatically instead of failing as a whole. The rejected value and Unicode code points are logged for diagnostics.

## Welcome variables

- `{user}`
- `{username}`
- `{displayName}`
- `{server}`
- `{memberCount}`

## Local dashboard

Default development URL:

`http://31.70.115.79:3000`

Discord callback:

`http://31.70.115.79:3000/auth/discord/callback`
