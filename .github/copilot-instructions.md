# RAKU Discord Bot — current project state

## Current release

- Version: **0.27.0**
- Branch: `main`
- UI generation: **Orbit UI v6.2 + Module Shell**
- Global visual layer: `public/raku-orbit-v610.css`
- Final dashboard shell renderer: `public/raku-orbit-v600.js`
- Shared module shell: `public/raku-module-shell.js` + `public/raku-module-shell.css`

## Critical UI decision

The previous conventional admin-dashboard generations are retired. Do not restore a fixed application sidebar + top context bar + rectangular KPI grid.

The authenticated application uses the Orbit spatial layout:

- floating server capsule top-left
- floating page capsule top-center
- floating action capsule top-right
- large free content canvas
- **floating labeled top command rail** below the capsules
- unique icon + visible text label for every module
- Module Constellation overview with the current Discord server in the center
- Activity, Health and Quick Actions as asymmetric glass islands

The old bottom dock layout is explicitly retired. Do not move primary navigation back to the bottom.

## Current module-shell rules

All feature pages use the shared module shell and common width contract. Do not reintroduce module-specific outer widths.

Each module may have its own internal editor layout, but the outer page width, hero entry and vertical rhythm are shared. Existing module headings can act as toolbars below the shared hero; do not duplicate the same title twice.

## Creator Alerts / Social provider architecture — v0.27.0

Supported Creator Hub platforms:

- Twitch
- YouTube
- TikTok
- Instagram
- Bluesky
- X

Important provider rules:

- **Bluesky:** direct public ATProto AppView; no credentials.
- **X:** server-side read provider through `x.md` (`x.pcstyle.dev`) for public profile timelines. No X login or customer X API key.
- **Instagram:** primary keyless path is browserless TLS/HTTP impersonation using `impit`. It may use a Chrome-compatible TLS/header fingerprint, but it does **not** launch Chrome/Edge/Brave, Puppeteer, Playwright or any local browser process.
- Optional Instagram production fallbacks are `RAKU_SOCIAL_RELAY_URL` / `RAKU_SOCIAL_RELAY_TOKEN` or a backend-only `SCRAPECREATORS_API_KEY`.
- Customer Discord servers must never be asked to provide Instagram/X API keys, cookies or browser sessions.
- `src/creator-social-provider-router.js` is the provider entry point used by `creator-social-runtime.js`.
- `src/creator-social-browser.js` and its browser test were intentionally deleted. **Do not recreate a local browser social fallback.**

Instagram public Node `fetch` endpoints are currently unreliable/rate-limited. Do not solve that by adding more retries to `web_profile_info`/`feed/user` with the same Node TLS fingerprint. Use the browserless impersonated transport or central server-side provider infrastructure.

For manual `Quelle prüfen`:

- Instagram / Bluesky / X / YouTube upload / TikTok upload publish the current real content to Discord when the source check succeeds.
- Twitch and TikTok Live only validate the source; they do not publish a current-content message.
- Manual check publishing never role-pings.
- A successful provider check remains successful even if the subsequent Discord send fails; Discord publishing errors are reported separately.

## Visual direction

Orbit should feel premium and modern:

- deep dark spatial background
- real translucent glass with restrained edge highlights
- violet primary accent and cyan secondary signal accent
- strong readable contrast
- Manrope/Inter typography hierarchy
- subtle motion where it supports the spatial concept
- real Discord server icons
- no generated images
- no generic AI-admin-template structure

## Runtime architecture

`public/raku-orbit-v600.js` loads after Role/Ticket/Creator/Voice/Analytics hooks and owns the final authenticated shell.

Legacy hooks such as `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` remain only for functional compatibility. They must not visually become the old sidebar layout again.

Feature renderers still own functionality. `public/raku-orbit-v610.css` owns shared product appearance, outer module layout, responsive rules and design tokens.

## Known layout rules to preserve

- top command rail remains beneath the three floating capsules
- command rail items keep visible labels on desktop
- all module icons stay visually distinct
- desktop sticky Role/Ticket/Creator/Voice columns sit below the top rail
- Server gallery uses a five-card 7/5 + 4/4/4 rhythm with `grid-auto-flow:dense`
- all dynamic grid/flex children remain shrinkable with `min-width:0`
- Role/Ticket/Creator side lists become non-sticky before narrow layouts collide
- Commands progressively collapses from three columns to two to one
- Orbit Navigator collapses into a normal module grid on narrow screens
- Login, server picker and guild dashboard remain mutually exclusive screens; never override `.hidden`

## Retired files/concepts

Do not recreate or reference:

- local-browser Instagram/X social fallback
- `src/creator-social-browser.js`
- Orbit bottom navigation dock layout
- `public/raku-orbit-v600.css`
- `public/raku-studio-v500.css`
- `public/raku-workspace-v500.js`
- Studio v5 fixed app sidebar
- Studio v5 conventional context-bar shell
- `public/raku-prism-v400.css`
- `public/raku-ui-v100.js`
- `public/raku-glass-v300.css`
- `public/raku-design-v200.css`
- UX-v2 runtime decorators/guides/hints
- module unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

Avoid fake interface language such as CONTROL NODE, SERVER PULSE, CONTROL OS, fake READY boards or decorative fake telemetry.

## Priorities

1. Preserve the genuinely different Orbit architecture.
2. Keep primary navigation obvious through label + icon.
3. Keep every feature functional.
4. Fix layout/overflow bugs at the canonical source, not with new override layers.
5. Readability before visual effects.
6. Glass should add material/depth without washing out text.
7. Do not add a second product-wide stylesheet.
8. Creator social monitoring must remain browserless for Instagram/X on customer machines.

See `DESIGN.md` for the detailed visual contract.