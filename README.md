# RAKU Discord Bot

Multi-user Discord bot with web dashboard.

## Development

- Node.js 20+
- Dashboard and bot start together via `start.cmd`
- Discord OAuth scopes: `identify guilds`
- Bot install scopes: `bot applications.commands`
- Privileged intents required: `Server Members Intent` and `Message Content Intent`
- JavaScript syntax is checked automatically by GitHub Actions on every push / pull request.

## Current modules

- Welcome
- Auto-Role
- Server Logs
- Custom Commands / Flow Builder
- Role Studio with Buttons, Dropdowns and Reaction Roles
- Ticket Studio with forms, private channels, claiming, archive flow and transcripts
- Creator Hub with Twitch, YouTube and adapter-based TikTok automations

## Role Studio

Role Studio supports multiple panels per guild, live previews, publish/update/unpublish, exclusive or multi-role selection and an integrated emoji picker.

Component emoji publishing is fault-tolerant: if Discord rejects a specific Unicode emoji for a button/select component, the affected emoji is removed from that one role entry and the panel is retried automatically instead of failing as a whole. The rejected value and Unicode code points are logged for diagnostics.

## Creator Hub

Creator Hub uses a source -> event -> rule -> Discord-output model. Each server can configure multiple rules with provider diagnostics, real source checks, cooldowns, title/category filters, quiet hours, first-seen protection, templates, live Discord previews, safe test notifications and an event ledger for sent, filtered, suppressed, baseline and failed events.

Provider strategy:

- Twitch: official Helix API using app credentials from `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`.
- YouTube: upload monitoring through the public channel RSS feed, so no API key or quota-heavy polling is required.
- TikTok: intentionally adapter-based through `TIKTOK_STATUS_ENDPOINT`; the dashboard does not pretend TikTok is connected when no reliable provider is configured.

The Creator runtime deduplicates events persistently so service restarts do not create duplicate notifications. New rules use a safe baseline by default instead of announcing an already-active stream/video unless explicitly enabled.

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
