# ORBIT — Product & UI Design Contract

## Brand

The product name is **ORBIT**.

Concept: the Discord server is the central core; management and automation modules form the orbit around it. This concept is structural, not decorative: the overview's Module Constellation visualizes the same idea.

Approved brand asset:

- `public/orbit-wordmark.svg` — canonical ORBIT wordmark used in the header and login

Do not reintroduce RAKU as visible product branding. Legacy internal identifiers may remain temporarily where renaming them would risk runtime compatibility, but they are implementation details only.

## Current architecture

The product-wide interface uses the Orbit spatial architecture:

- no fixed application sidebar
- floating server capsule top-left
- floating current-page capsule top-center
- floating action capsule top-right
- one free workspace canvas
- floating labeled top command rail below the capsules
- every navigation item exposes icon + text on desktop
- overview centers on a Module Constellation rather than a KPI/card wall

The current runtime files still include historical filenames `public/raku-orbit-v610.css`, `public/raku-orbit-v600.js`, `public/raku-module-shell.css` and `public/raku-module-shell.js`. These names are compatibility-only and are not part of the public brand.

## Orbit Navigator

The overview places the real Discord server in the illuminated center core with operational modules around it. Inner/outer orbital geometry, connector paths and restrained signal motion reinforce the product model without turning the interface into decorative sci-fi.

On narrow screens the constellation becomes a normal module grid so the visual metaphor never damages usability.

## Typography and glass

- Manrope for display/headline/navigation typography
- Inter for working UI text
- deep dark spatial background
- translucent glass with restrained edge highlights and controlled shadow
- violet primary accent and cyan secondary signal accent
- strong readable contrast
- ordinary working text normally 10–14px
- dynamic names/messages must truncate or wrap safely
- dynamic flex/grid children remain shrinkable with `min-width:0`

## Module layout contract

All feature pages use the same outer width, hero language and vertical rhythm. Feature internals may use editors, side lists and previews when useful, but they must not introduce their own outer page widths.

Specific rules:

- module toolbars wrap rather than overflow
- Role/Ticket/Creator side lists become non-sticky on narrower layouts
- desktop sticky editor/preview elements sit below the top command rail
- Commands progressively collapses from three columns to two to one
- form grids collapse to one column on narrow screens

## Login

Login is a centered glass portal with the approved ORBIT wordmark and subtle ambient feature chips. Do not restore a conventional split-screen login or fake system console.

## Server picker

The server picker is an asymmetric gallery with real Discord server icons. Desktop uses the established dense 12-column rhythm rather than equal generic cards.

## Screen contract

Login, server picker and guild dashboard are mutually exclusive application states. Visual CSS must never override `.hidden`.

## Bot Profile

The Bot Profile module supports server-specific bot nickname, avatar and bio. It intentionally does not expose activity/presence controls because Discord presence is global to the shared bot connection.

## Retired architecture

Do not restore:

- conventional fixed app sidebar + context bar dashboard
- bottom primary navigation dock
- Prism / Glass / Studio v5 generations
- duplicate global polish/fix/readability stylesheets
- Bot Profile Activity / `GLOBAL · GESPERRT` block
- per-guild `setPresence()` / `setActivity()` on the shared bot
- local-browser Instagram/X social fallback

## Rule

Polish ORBIT in place. If a change hides navigation behind ambiguous icons, rebuilds a generic admin dashboard, moves primary navigation back to the bottom, or requires another global appearance layer, the approach is wrong.
