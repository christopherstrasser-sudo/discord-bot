# RAKU Discord Bot — current project state

## Current release

- Version: **0.21.0**
- Branch: `main`
- UI generation: **Orbit UI v6**
- Global visual layer: `public/raku-orbit-v600.css`
- Final dashboard shell renderer: `public/raku-orbit-v600.js`

## Critical UI decision

The previous Studio v5 layout was explicitly rejected because it still reused the same conventional admin-dashboard architecture.

Do not restore a fixed application sidebar + conventional top context bar + rectangular dashboard grid.

The authenticated application now uses a spatial layout:

- floating server capsule at the top left
- floating page capsule in the top center
- floating action capsule at the top right
- large free content canvas
- floating bottom navigation dock
- active dock item expands to show its label
- Module Constellation overview with the current Discord server in the center
- Activity, Attention and Quick Actions as asymmetric glass islands

This silhouette is intentional and is the main architectural break from all previous generations.

## Login and server picker

Login is a centered glass authentication portal with a few floating feature chips. Do not restore a two-column text/console login.

Server selection is an asymmetric workspace gallery with real Discord server icons. Do not restore a uniform equal-card grid if a more editorial composition works.

## Retired files/concepts

Do not recreate or reference:

- `public/raku-studio-v500.css`
- `public/raku-workspace-v500.js`
- Studio v5 fixed app sidebar
- Studio v5 conventional context-bar shell
- `public/raku-prism-v400.css`
- `public/raku-ui-v100.js`
- `public/raku-glass-v300.css`
- `public/raku-design-v200.css`
- UX-v2 decorators/guides/hints
- module unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

Avoid fake interface language such as CONTROL NODE, SERVER PULSE, CONTROL OS, fake READY boards or decorative fake telemetry.

## Visual direction

Orbit is allowed to have a stronger visual identity than Studio v5:

- modern glass surfaces
- dark spatial background
- violet primary accent and restrained cyan signal accent
- readable contrast
- depth and blur without washing out text
- subtle floating motion where useful
- real Discord server icons
- no generated images
- no generic AI-admin-template layout

## Runtime architecture

`public/raku-orbit-v600.js` loads after Role/Ticket/Creator/Voice/Analytics hooks and owns the final authenticated shell.

Legacy hooks such as `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` may remain only for functional compatibility. They must not visually become the old sidebar layout again.

Feature renderers still own their internal functionality. `raku-orbit-v600.css` owns the product-wide appearance and shared outer layout.

## Screen contract

Login, server picker and guild dashboard are mutually exclusive screens. Never let design CSS override `.hidden`.

## Priorities

1. Preserve the genuinely different Orbit architecture.
2. Keep every feature functional.
3. Readability before visual effects.
4. Glass and motion should create depth, not clutter.
5. Do not add a second product-wide fix/override stylesheet.
6. If a new design proposal resembles a normal admin sidebar dashboard, reject the structure before polishing it.

See `DESIGN.md` for the detailed visual contract.
