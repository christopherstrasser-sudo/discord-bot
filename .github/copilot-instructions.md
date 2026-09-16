# RAKU Discord Bot — current project state

## Current release

- Version: **0.19.0**
- Branch: `main`
- UI generation: **Prism OS v4**
- Canonical product-wide visual file: `public/raku-prism-v400.css`

## Critical design decision

On 2026-09-16 the previous Glass UI v3 was intentionally discarded after the user requested a complete visual restart rather than another round of line-by-line fixes.

Do not restore `public/raku-glass-v300.css` and do not recreate its look as a patch layer.

Also keep the older retired design layers retired:
- `layout-wide.css`
- `ui-fixes.css`
- `raku-ui-v100.css`
- `raku-ui-v100-overrides.css`
- `raku-ux-v2.css`
- `raku-readability-v121.css`
- `raku-visual-system-v140.css`
- `raku-visual-v141-fix.css`
- `raku-module-unification-v142.css`
- `role-studio-v150.css`
- `ticket-studio-v160.css`
- `raku-design-v200.css`
- `raku-glass-v300.css`
- UX-v2 runtime decorators/guides/hints

## Prism OS direction

Prism OS is a fresh product language, not a continuation of v3:
- dark control-system canvas
- restrained translucent surfaces
- larger, clearer typography
- more whitespace
- violet/cyan signal accents
- fewer tiny labels
- consistent work-area/preview geometry
- calm navigation and card hierarchy
- no generated decorative imagery
- no instructional clutter

The same visual system applies to:
- login
- server picker
- overview
- Welcome
- Auto-Roles
- Role Studio
- Ticket Studio
- Commands
- Creator Hub
- Server Logs
- Voice Studio
- Analytics
- Diagnostics

## Screen architecture

Login, server picker and guild dashboard are three mutually exclusive screens.

`public/index.html` contains a hard `.hidden` visibility contract for:
- `#loggedOut`
- `#serverList`
- `#guildDashboard`

Never let design CSS override app visibility state.

## CSS architecture

Load order in `public/index.html`:
1. base/component mechanics CSS
2. `public/raku-prism-v400.css` last

`raku-prism-v400.css` is the only product-wide appearance authority.

Never add another global `fix`, `polish`, `wide`, `readability` or override stylesheet.
Never dynamically inject design CSS from JavaScript.

See `DESIGN.md` for the layout/readability contract.

## Runtime UI files

Keep:
- `public/raku-ui-v100.js` — navigation grouping and overview behavior; old filename, active behavior.
- `public/save-button-fix.js` — save behavior only; never load visual assets here.
- module JS files for Role/Ticket/Creator/Voice/Analytics/Commands.

## UX priorities

1. One coherent commercial product before module-specific polish.
2. Readability before density.
3. Major editors use a large work area plus predictable preview/status area.
4. Login and server picker must clearly belong to the same product as the dashboard.
5. Server cards keep real Discord server icons where available.
6. Do not generate images for the interface.
7. Do not revive the v3 look or solve visual issues with new override files.

## Next work

Continue feature development from **v0.19.0**. Visual changes go directly into Prism OS v4.
