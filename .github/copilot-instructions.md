# ORBIT — current project state

## Current release

- Version: **0.29.0**
- Branch: `main`
- Product brand: **ORBIT**
- Brand concept: the Discord server is the center; bot capabilities/modules form the orbit around it
- Approved wordmark: `public/orbit-wordmark.svg`
- UI generation: Orbit UI v6.2 + Module Shell
- Bot Profile module: `public/bot-profile.js` + `public/bot-profile.css`

## Branding contract

ORBIT is the canonical public product name. Do not reintroduce RAKU in visible UI copy, launcher text, README, page titles or new configuration names.

The approved ORBIT wordmark is used in the topbar and login screen. Generated decorative interface imagery remains disallowed; the approved brand wordmark is an explicit brand-asset exception.

Some existing runtime filenames and JavaScript globals still contain historical `raku` / `Raku` identifiers for compatibility. They are internal implementation details, not product branding. Do not rename them casually in feature work unless all dependent hooks are migrated together and tested.

## Critical UI decision

The authenticated application uses the Orbit spatial layout:

- floating server capsule top-left
- floating page capsule top-center
- floating action capsule top-right
- large free content canvas
- floating labeled top command rail below the capsules
- unique icon + visible text label for every module
- Module Constellation overview with the current Discord server in the center
- Activity, Health and Quick Actions as asymmetric glass islands

Do not restore a conventional fixed application sidebar + context bar + rectangular KPI dashboard. The old bottom dock is retired.

## Module shell

All feature pages use the shared outer width/hero language. Module-specific editors may have their own internal columns, but must not introduce different outer widths.

Existing historical shell filenames remain compatibility-only:

- `public/raku-orbit-v610.css`
- `public/raku-orbit-v600.js`
- `public/raku-module-shell.css`
- `public/raku-module-shell.js`

The product itself is ORBIT regardless of those filenames.

## Bot Profile

Server administrators can customize the shared bot's guild member profile:

- server nickname / bot display name
- server avatar
- server bio

Backend API: `src/bot-profile-api.js` using Discord `PATCH /guilds/{guild.id}/members/@me`.

The previous disabled Activity section was removed. Do not add server-specific `setPresence()` / `setActivity()` to the shared bot because Discord presence is global to the bot connection.

## Creator Alerts / Social provider architecture

Supported platforms:

- Twitch
- YouTube
- TikTok
- Instagram
- Bluesky
- X

Provider rules:

- Bluesky: public ATProto AppView; no credentials.
- X: server-side public read relay through x.md; no customer X login/API key.
- Instagram: central ORBIT relay when configured → backend provider → public Imginn relay → browserless direct resolver as final fallback.
- New relay configuration names are `ORBIT_SOCIAL_RELAY_URL` and `ORBIT_SOCIAL_RELAY_TOKEN`.
- Runtime may temporarily read the old RAKU-prefixed relay variables as backwards-compatible fallbacks only. Do not document those old names for new installations.
- Customer servers must never be asked for Instagram/X API keys, cookies or browser sessions.
- Never recreate a local Chrome/Edge/Puppeteer/Playwright social fallback.

For manual `Quelle prüfen`:

- Instagram / Bluesky / X / YouTube upload / TikTok upload publish the current real content to Discord after a successful source check.
- Twitch and TikTok Live validate only.
- Manual source-check publishing never role-pings.
- Provider success stays provider success even if Discord delivery fails; delivery errors are separate.

## Visual direction

ORBIT should feel premium, modern and deliberately different from generic admin dashboards:

- deep dark spatial background
- real translucent glass with restrained edge highlights
- violet primary accent and cyan secondary signal accent
- strong readable contrast
- Manrope/Inter typography hierarchy
- subtle purposeful motion
- real Discord server icons
- no generic AI-admin-template structure

## Known layout rules

- top command rail remains beneath the three floating capsules
- command rail items keep visible labels on desktop
- module icons stay visually distinct
- Bot Profile stays clearly labeled in the command rail
- desktop sticky Role/Ticket/Creator/Voice/Profile columns sit below the top rail
- dynamic flex/grid children remain shrinkable with `min-width:0`
- Orbit Navigator collapses to a normal module grid on narrow screens
- login, server picker and guild dashboard remain mutually exclusive; never override `.hidden`

## Retired concepts

Do not recreate:

- visible RAKU branding
- Bot Profile Activity / `GLOBAL · GESPERRT` section
- per-guild shared-bot presence/activity controls
- local-browser Instagram/X fallback
- Orbit bottom navigation dock
- Studio v5 fixed sidebar/context-bar layout
- Prism/Glass/old RAKU visual generations
- duplicate global fix/polish/readability layers

## Priorities

1. Preserve ORBIT's distinct spatial architecture.
2. Keep navigation obvious through label + icon.
3. Keep every feature functional.
4. Fix bugs at the canonical source, not with stacked override files.
5. Readability before effects.
6. Glass adds depth without washing out text.
7. Shared-bot tenant isolation is mandatory.
8. Keep public branding consistently ORBIT.

See `DESIGN.md` for the detailed visual contract.
