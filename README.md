# ORBIT

**Your community at the center.**

ORBIT is a multi-server Discord management platform with a web dashboard. The Discord server is the center; automation and management modules form the orbit around it.

## Development

- Node.js 20+
- Dashboard and bot start together via `start.cmd`
- Discord OAuth scopes: `identify guilds`
- Bot install scopes: `bot applications.commands`
- Privileged intents required: `Server Members Intent` and `Message Content Intent`
- JavaScript syntax, CSS sanity, architecture contracts and automated tests run in GitHub Actions.

## Current modules

- Overview / Orbit Navigator
- Welcome
- Auto-Roles
- Bot Profile: per-server name, avatar and bio
- Role Studio with Buttons, Dropdowns and Reaction Roles
- Ticket Studio with forms, private channels, claiming, archive flow and transcripts
- Voice Studio for temporary rooms and lobby automation
- Commands / Flow Builder
- Creator Alerts: Twitch, YouTube, TikTok, Instagram, Bluesky, X and SoundCloud
- Server Logs
- Analytics
- Diagnostics

## Creator Alerts

Creator Alerts use a source → event → rule → Discord-output model. Each server can configure multiple rules with provider diagnostics, real source checks, cooldowns, filters, quiet hours, templates, live Discord previews, safe test notifications and a persistent event ledger.

Provider strategy:

- Twitch: official Helix API using backend app credentials.
- YouTube: public channel RSS for uploads.
- TikTok: built-in local provider.
- Bluesky: public ATProto AppView.
- X: server-side public read relay; no customer X API key required.
- Instagram: fully anonymous public web profile lookup. ORBIT uses one request per profile refresh, aggressive per-profile caching and exponential backoff; no login, session ID, API key, paid API or external read service is required.
- SoundCloud: keyless public profile/web-client discovery with embedded-data and RSS fallbacks; no Pro account, login or API key is required, and ORBIT watches the artist's own track uploads (not likes or reposts).

Manual `Quelle prüfen` publishes the latest real post/upload for supported content sources without a role ping. Twitch and TikTok Live remain validation-only because there is no static latest post to publish.

## Bot Profile

Server administrators can give the shared ORBIT bot a server-specific nickname, avatar and bio. These values are stored by Discord on the guild member profile and affect only that server.

Discord bot presence/activity is global to the bot connection, so ORBIT intentionally does not expose fake per-server activity controls on the shared bot.

## Brand

The product name is **ORBIT**. The approved wordmark lives at `public/orbit-wordmark.svg` and is used in the dashboard header and login screen.

The visual concept mirrors the product architecture: the Discord server is the central core and its modules occupy the surrounding orbit.

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
