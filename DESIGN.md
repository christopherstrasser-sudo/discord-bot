# RAKU Discord Control — Orbit UI v6.2

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
6. a **floating top command rail** directly below the capsules
7. every command-rail item always exposes icon + text on desktop
8. overview centers on a Module Constellation rather than a KPI/card wall

Legacy hooks like `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` exist only for compatibility with feature code. They must never recreate the old sidebar layout.

## v6.2 command rail

The old bottom dock is retired.

The authenticated dashboard now uses a labeled top command rail:

- top position below the three context capsules
- always-visible module labels on desktop
- horizontal scrolling on narrower screens rather than icon-only ambiguity
- unique SVG symbol for every module
- subtle group separators
- active item gets a glass highlight plus violet/cyan indicator line
- module status remains visible as a small state point

Do not move the primary module navigation back to the bottom of the viewport.

## Overview / Orbit Navigator

The overview uses an upgraded **Orbit Navigator**:

- real Discord server in the illuminated center core
- eight operational module nodes around the server
- separate inner and outer orbit geometry
- three orbital rings with restrained motion
- visible connector paths from server core to module nodes
- connector path brightens when its module node is hovered or focused
- small orbital signal beacons and a subtle server activity signal
- Activity, Health and Quick Actions remain separate glass islands
- compact metrics stay secondary

The primary nodes are Welcome, Auto-Roles, Roles, Tickets, Commands, Creator Alerts, Voice and Logs. Analytics and Diagnostics remain available in the top command rail and quick actions.

On narrow screens, constellation nodes become a normal two-column/one-column module grid underneath the server core so the Orbit concept never causes overlap or horizontal clipping.

## Typography and glass

- Manrope for display/headline/navigation typography
- Inter for working UI text
- dark translucent material, restrained light edge, inner highlight and controlled shadow
- violet primary accent and cyan secondary signal accent
- ordinary working text normally 10–14px
- dynamic names/messages must truncate or wrap safely
- every dynamic grid/flex child must be shrinkable with `min-width: 0`

## Module layout contract

Feature internals may have side lists/editor/preview columns when needed, but they must obey Orbit's outer geometry.

Specific rules:
- module toolbars wrap rather than overflow
- Role/Ticket/Creator side lists become non-sticky on narrower layouts
- desktop sticky editor/preview elements sit **below the top command rail**
- Ticket panelbar and Role commandbar wrap instead of using old fixed grid columns
- Commands progressively collapses from three columns to two to one
- form grids collapse to one column on narrow screens

## Login

Login is a centered glass portal with subtle ambient light and a few floating feature chips. Do not restore a text-left / fake-console-right layout.

## Server picker

The server picker is an asymmetric gallery with real Discord server icons.

The desktop rhythm uses five-card cycles:
- card 1: 7 columns
- card 2: 5 columns
- cards 3–5: 4 columns each

This fills complete 12-column rows with `grid-auto-flow:dense`. Do not restore the old six-card `nth-child` pattern.

## Screen contract

Login, server picker and guild dashboard are mutually exclusive screens. Visual CSS must never override `.hidden`.

## Retired architecture

Do not restore or reference:
- the Orbit bottom navigation dock layout
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

Polish the Orbit architecture in place. If a change starts rebuilding a conventional admin dashboard, hides navigation behind ambiguous icons, moves the command rail back to the bottom, or requires another global override file, the approach is wrong.