# RAKU Discord Bot — current project state

## Current release

- Version: **0.23.0**
- Branch: `main`
- UI generation: **Orbit UI v6.2**
- Global visual layer: `public/raku-orbit-v610.css`
- Final dashboard shell renderer: `public/raku-orbit-v600.js`

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

## v0.23.0 Orbit v6.2

This pass upgrades navigation clarity and the overview's visual identity:

- top command rail replaces the bottom dock
- every module remains visibly labeled on desktop
- every module has its own SVG symbol instead of reusing ambiguous generic icons
- narrow layouts horizontally scroll the labeled command rail
- eight modules are represented directly in the Orbit Navigator
- connector paths run from the server core to every module node
- hovered/focused node brightens its connector
- three orbit rings, subtle beacons and server activity signal add depth
- narrow screens convert constellation nodes into a clean grid rather than overlapping
- editor sticky positions are offset below the top command rail
- asset cache version bumped to `0230`

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

See `DESIGN.md` for the detailed visual contract.