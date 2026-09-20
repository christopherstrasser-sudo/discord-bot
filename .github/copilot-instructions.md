# ORBIT — current project state

## Current release

- Version: **0.31.0**
- Branch: `main`
- Product brand: **ORBIT**
- Brand concept: the Discord server is the center; bot capabilities/modules form the orbit around it
- Approved wordmark: `public/orbit-wordmark.svg`
- UI generation: ORBIT Control + Module Shell
- Bot Profile module: `public/bot-profile.js` + `public/bot-profile.css`

## Branding contract

ORBIT is the canonical public product name. Do not reintroduce RAKU in visible UI copy, launcher text, README, page titles or new configuration names.

The approved ORBIT wordmark is used in the topbar and login screen. Generated decorative interface imagery remains disallowed; the approved brand wordmark is an explicit brand-asset exception.

Some existing runtime filenames and JavaScript globals still contain historical `raku` / `Raku` identifiers for compatibility. They are internal implementation details, not product branding. Do not rename them casually in feature work unless all dependent hooks are migrated together and tested.

## Critical UI decision

The current design is **ORBIT Control** (September 2026). The user requested a
complete visual redesign while retaining the existing layout structure. It uses
labeled desktop navigation on the left, a workspace header, a mobile navigation
menu, and one consistent content canvas. The overview's interactive CSS orbit
keeps the Discord server at the center. A module switcher is available with
Ctrl+K / Cmd+K. Login and server selection use the same visual identity.

`public/raku-orbit-v610.css` is the canonical product stylesheet. Do not restore
retired global polish layers or layer new override files over it. See DESIGN.md.

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

## Visual direction and layout

- Graphite surfaces, sage / mint accents, strong readable contrast.
- Locally hosted Inter / Manrope; fonts and OFL licenses live in public/fonts.
- Approved ORBIT wordmark and real Discord server icons; CSS / SVG orbit geometry.
- Shared heroes and one outer width for all modules.
- Labeled navigation on desktop and in the mobile menu.
- Shrinkable flex/grid children; editors collapse before controls become cramped.
- Real module state and clear empty / loading / unavailable states.
- Visible keyboard focus and reduced-motion support.
- Login, server picker and dashboard remain mutually exclusive; honor `.hidden`.

Do not recreate visible RAKU branding, per-guild shared-bot presence controls,
local-browser Instagram/X fallbacks or duplicate global design layers.

## Priorities

1. Keep the current ORBIT Control architecture consistent.
2. Keep navigation obvious through label + icon.
3. Keep every feature functional.
4. Fix bugs at the canonical source, not with stacked override files.
5. Readability before effects.
6. Use clear surface contrast without washing out text.
7. Shared-bot tenant isolation is mandatory.
8. Keep public branding consistently ORBIT.

See `DESIGN.md` for the detailed visual contract.
