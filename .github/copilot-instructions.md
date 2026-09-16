# RAKU Discord Bot — current project state

## Current release

- Version: **0.22.0**
- Branch: `main`
- UI generation: **Orbit UI v6.1**
- Global visual layer: `public/raku-orbit-v610.css`
- Final dashboard shell renderer: `public/raku-orbit-v600.js`

## Critical UI decision

The previous conventional admin-dashboard generations are retired. Do not restore a fixed application sidebar + top context bar + rectangular KPI grid.

The authenticated application uses the Orbit spatial layout:

- floating server capsule top-left
- floating page capsule top-center
- floating action capsule top-right
- large free content canvas
- floating bottom navigation dock
- active dock item expands to show its label
- Module Constellation overview with the current Discord server in the center
- Activity, Attention and Quick Actions as asymmetric glass islands

This silhouette is intentional and must survive future polish.

## v0.22.0 production polish

The v6.1 pass keeps the Orbit concept but upgrades finish quality across the full product:

- Manrope display/navigation typography + Inter working UI typography
- stronger, more consistent glass material
- unified controls/forms/focus states
- refined dock with hover labels
- improved constellation depth and subtle motion
- corrected asymmetric server gallery without empty grid holes
- responsive anti-overflow rules for all complex modules
- flexible/wrapping Role, Ticket and Creator toolbars
- progressive collapse for Commands editor
- Orbit-styled emoji modal
- compatibility CSS variables for legacy module mechanics

## Retired files/concepts

Do not recreate or reference:

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

## Visual direction

Orbit v6.1 should feel premium and modern rather than basic:

- deep dark spatial background
- real translucent glass with restrained edge highlights
- violet primary accent, cyan secondary signal accent
- strong readable contrast
- clean Manrope/Inter typography hierarchy
- subtle motion only where it supports the spatial concept
- real Discord server icons
- no generated images
- no generic AI-admin-template structure

## Runtime architecture

`public/raku-orbit-v600.js` loads after Role/Ticket/Creator/Voice/Analytics hooks and owns the final authenticated shell.

Legacy hooks such as `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` remain only for functional compatibility. They must not visually become the old sidebar layout again.

Feature renderers still own functionality. `public/raku-orbit-v610.css` owns shared product appearance, outer module layout, responsive rules and design tokens.

## Known layout rules to preserve

- Server gallery uses a five-card 7/5 + 4/4/4 rhythm with `grid-auto-flow:dense`; do not restore the old six-card pattern that left empty columns.
- All dynamic grid/flex children must be shrinkable (`min-width:0`) where long names/messages can appear.
- Role/Ticket/Creator side lists become non-sticky before narrow layouts collide.
- Role and Ticket command bars wrap instead of forcing fixed columns.
- Commands editor progressively collapses from three columns to two to one.
- Preview columns lose sticky positioning before they can overlap the floating header.
- Login, server picker and guild dashboard remain mutually exclusive screens; never override `.hidden`.

## Priorities

1. Preserve the genuinely different Orbit architecture.
2. Keep every feature functional.
3. Fix layout/overflow bugs at the canonical source, not with new override layers.
4. Readability before visual effects.
5. Glass should add material/depth without washing out text.
6. Do not add a second product-wide stylesheet.

See `DESIGN.md` for the detailed visual contract.