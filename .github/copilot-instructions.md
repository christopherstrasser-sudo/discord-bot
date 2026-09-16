# RAKU Discord Bot — current project state

## Current release

- Version: **0.20.0**
- Branch: `main`
- UI generation: **Studio UI v5**
- Global visual layer: `public/raku-studio-v500.css`
- Final dashboard shell renderer: `public/raku-workspace-v500.js`

## Critical UI decision

The previous Prism/Glass/Control-OS dashboard direction was explicitly rejected. Do not restore it.

The authenticated dashboard was rebuilt structurally, not merely reskinned:

- no second global header above the dashboard
- fixed left application sidebar
- one slim context bar
- one workspace
- compact operational overview
- no giant server hero
- no fake telemetry or sci-fi copy

## Retired files/concepts

Do not recreate or reference:

- `public/raku-ui-v100.js`
- `public/raku-prism-v400.css`
- `public/raku-glass-v300.css`
- `public/raku-design-v200.css`
- UX-v2 runtime decorators/guides/hints
- module unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

Avoid phrases and UI concepts such as:

- CONTROL NODE
- SERVER PULSE
- CONTROL OS
- Prism OS
- fake READY/ONLINE system boards used as decoration

## Visual direction

The product should look like a serious creator/community administration app:

- dark neutral base
- restrained violet accent
- modest translucency, not glass everywhere
- compact navigation
- readable working UI
- real information density
- minimal decorative microcopy
- consistent forms, cards, spacing and radii
- real Discord server icons remain visible in server cards
- no generated images in the interface

## Runtime architecture

`public/raku-workspace-v500.js` is loaded after Role/Ticket/Creator/Voice/Analytics module hooks and owns the final dashboard shell.

It intentionally keeps legacy class hooks such as `.deck-nav`, `.deck-nav-item`, `.guild-commandbar` and `#guildWorkspace` only for compatibility with existing functional code. Their old visual layout is retired.

Module renderers still own their functionality. `raku-studio-v500.css` normalizes the visible outer layout and controls.

## Screen contract

Login, server picker and guild dashboard are mutually exclusive screens. Never use visual CSS that overrides `.hidden`.

## UX priorities

1. Functionality and readability before decoration.
2. Simplify structure before adding effects.
3. Avoid generic AI-admin-dashboard patterns.
4. Keep module layout consistent.
5. No giant empty surfaces.
6. No new global polish/override stylesheet.

See `DESIGN.md` for the detailed design contract.
