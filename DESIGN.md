# RAKU Discord Control — Orbit UI v6

## Current architecture

The product-wide interface is built around exactly two final UI files:

- `public/raku-orbit-v600.css` — the only product-wide visual layer
- `public/raku-orbit-v600.js` — the final authenticated shell and overview renderer

They load after all feature modules so existing bot functionality remains intact while the visible application structure is owned by Orbit.

## Why Orbit exists

Multiple earlier generations kept returning to the same admin-dashboard silhouette: left sidebar, top context bar, rectangular cards and a conventional content grid. That direction is retired.

Orbit must look structurally different before any color, blur or radius is considered.

## Dashboard silhouette

The authenticated dashboard uses a spatial workspace:

1. no fixed application sidebar
2. a floating server capsule at the top left
3. a small floating page capsule in the center
4. a floating action capsule at the top right
5. one large free workspace canvas
6. a floating bottom navigation dock
7. the active dock item expands to show its label
8. inactive items stay compact and expose state through a small status point

Legacy `.deck-nav`, `.deck-nav-item` and `#guildWorkspace` hooks may remain only because existing functional code expects them. They must not visually recreate the old sidebar shell.

## Overview

The overview is not a hero dashboard and not a KPI wall.

Its central interaction is the **Module Constellation**:

- current Discord server in the center
- clickable module nodes arranged around it
- subtle orbital geometry used as navigation context
- Activity, Attention and Quick Actions live in separate asymmetric glass islands
- summary numbers stay compact and secondary

The overview should feel like a control surface, not a template marketplace dashboard.

## Login

Login is a centered authentication portal, not a left-text/right-console split.

It uses:

- one central glass sign-in surface
- subtle ambient gradient light
- a few floating feature chips around it
- no fake telemetry, fake terminals or READY boards

## Server picker

The server picker is an asymmetric workspace gallery.

- real Discord server icons remain visible
- cards intentionally use different spans on desktop
- the page should not look like a repeated equal-card admin grid
- search and filtering remain simple and readable

## Visual direction

Orbit may use more glass than Studio v5, but glass must still support hierarchy.

Target qualities:

- dark spatial background
- translucent floating surfaces
- violet as the primary accent and cyan only as a secondary signal
- high text contrast
- subtle blur and depth
- restrained glow
- readable working text (normally 10–15px)
- animated motion only where it reinforces floating/spatial behavior
- no generated images
- no fake sci-fi system copy

## Feature modules

Existing module CSS keeps internal mechanics only:

- `styles.css`
- `commands-editor.css`
- `role-studio.css`
- `ticket-studio.css`
- `creator-hub.css`
- `voice-studio.css`
- `analytics-studio.css`
- `emoji-picker-popup.css`

Orbit owns shared outer surfaces, form styling, spacing, glass treatment and responsive behavior.

Internal editor sidebars or preview columns are allowed when the feature itself requires them. They are not application navigation.

## Screen contract

Login, server picker and guild dashboard are mutually exclusive app screens. Visual CSS must never override the `.hidden` state.

## Retired architecture

Do not restore or reference:

- `raku-studio-v500.css`
- `raku-workspace-v500.js`
- the Studio v5 fixed application sidebar
- the Studio v5 slim context bar layout
- `raku-prism-v400.css`
- `raku-ui-v100.js`
- `raku-glass-v300.css`
- `raku-design-v200.css`
- UX-v2 decorators/guides/hints
- module-unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

Do not add another global fix/polish/override stylesheet. Shared visual changes belong directly in `raku-orbit-v600.css`.

## Rule

If a proposed redesign can be achieved by merely moving the old sidebar or recoloring the old cards, it is not a new design. Preserve the Orbit silhouette first: floating capsules, free canvas, bottom dock and constellation-based overview.
