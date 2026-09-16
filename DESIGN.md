# RAKU Discord Control — Orbit UI v6.1

## Current architecture

The product-wide interface has exactly two final UI authorities:

- `public/raku-orbit-v610.css` — the **only** product-wide visual layer
- `public/raku-orbit-v600.js` — the authenticated shell and constellation overview renderer

Feature CSS remains loaded only for component mechanics. Do not add a second global fix, polish, override, readability or glass stylesheet.

## Core silhouette

Orbit stays structurally different from conventional admin dashboards:

1. no fixed application sidebar
2. floating server capsule top-left
3. floating current-page capsule top-center
4. floating action capsule top-right
5. one free workspace canvas
6. floating bottom navigation dock
7. active dock item expands; inactive modules stay compact
8. overview centers on a Module Constellation rather than a KPI/card wall

Legacy hooks like `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` exist only for compatibility with feature code. They must never recreate the old sidebar layout.

## v6.1 production polish

Orbit v6.1 is the finish-quality pass. It adds:

- Manrope for display/headline/navigation typography
- Inter for working UI text
- deeper but restrained multi-layer glass
- consistent highlights, borders and shadows
- a complete form/control visual system
- dock hover labels and clearer active state
- refined constellation depth and subtle orbital motion
- glass treatment for the emoji picker
- a corrected five-card server-gallery rhythm with `grid-auto-flow:dense`
- hard anti-overflow rules for all editor modules
- responsive restructuring for Commands, Roles, Tickets, Creator, Voice and Analytics
- compatibility variables for legacy module CSS (`--surface-2`, `--green`, etc.) so inherited mechanics cannot silently lose styling

## Readability contract

- Headlines and navigation use Manrope.
- Body, fields and controls use Inter.
- Ordinary working text should normally be 10–14px.
- Tiny 8–9px text is reserved for genuinely secondary metadata only.
- Long server names, rule names and event strings must truncate or wrap safely instead of stretching grids.
- Every grid/flex child that can contain dynamic content should be allowed to shrink with `min-width: 0`.

## Glass contract

Glass should feel like material, not a blur filter pasted over everything.

Major surfaces use:
- translucent dark fill
- a restrained light edge
- one inner highlight
- controlled shadow depth
- backdrop blur where supported

Nested editor controls stay calmer than major floating surfaces. Discord message previews keep their Discord-like preview treatment so they remain visually distinct from the application chrome.

## Module layout contract

Feature internals may have side lists/editor/preview columns when needed, but they must obey Orbit's outer geometry.

Specific rules:
- module toolbars must wrap rather than overflow
- Role/Ticket/Creator side lists become non-sticky and horizontal/grid-like on narrower layouts
- preview columns stop being sticky before they can collide with the floating header
- Ticket panelbar and Role commandbar use wrapping layouts instead of old fixed grid columns
- Commands must collapse the three-column builder progressively instead of forcing horizontal overflow
- form grids collapse to one column on narrow screens

## Login

Login is a centered glass portal with subtle ambient light and a few floating feature chips. Do not restore a text-left / fake-console-right layout.

## Server picker

The server picker is an asymmetric gallery with real Discord server icons.

The desktop rhythm uses five-card cycles:
- card 1: 7 columns
- card 2: 5 columns
- cards 3–5: 4 columns each

This intentionally fills complete 12-column rows. Do not restore the old six-card `nth-child` pattern; it produced empty grid columns.

## Overview

The overview centers on the Module Constellation:
- real server in the core
- module nodes around it
- subtle orbital geometry
- Activity, Attention and Quick Actions as asymmetric glass islands
- compact metrics remain secondary

## Screen contract

Login, server picker and guild dashboard are mutually exclusive screens. Visual CSS must never override `.hidden`.

## Retired architecture

Do not restore or reference:
- `raku-orbit-v600.css`
- `raku-studio-v500.css`
- `raku-workspace-v500.js`
- Studio v5 fixed sidebar/context-bar layout
- `raku-prism-v400.css`
- `raku-ui-v100.js`
- `raku-glass-v300.css`
- `raku-design-v200.css`
- UX-v2 decorators/guides/hints
- module-unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

## Rule

Polish the Orbit architecture in place. If a change starts rebuilding a conventional admin dashboard or requires another global override file, the approach is wrong.