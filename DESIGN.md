# RAKU Discord Control — Prism OS v4

## Canonical visual layer

`public/raku-prism-v400.css` is the **only** product-wide appearance layer.

The previous Glass UI v3 was retired. Do not restore it, import from it, or create a second global polish layer.

Prism OS owns the visible product language for:
- login
- server picker
- top bar
- server command bar
- navigation
- overview
- simple modules
- Commands
- Role Studio
- Ticket Studio
- Creator Hub
- Voice Studio
- Analytics
- responsive layout
- shared typography, spacing, surfaces, controls and visual hierarchy

## Visual direction

Prism OS is a dark control-system interface with restrained translucent surfaces, clear white typography, violet/cyan signal accents and generous whitespace.

It should feel like one commercial desktop product, not a collection of unrelated admin pages.

The UI must prioritize:
1. readability
2. hierarchy
3. consistent geometry
4. obvious primary actions
5. calm surfaces instead of visual noise
6. individual server cards with real server icons

Do not add decorative generated imagery. Product identity comes from layout, typography, lighting, icons and motion.

## Module CSS

These files may keep component mechanics and module-specific internal structure:

- `public/styles.css`
- `public/commands-editor.css`
- `public/role-studio.css`
- `public/ticket-studio.css`
- `public/creator-hub.css`
- `public/voice-studio.css`
- `public/analytics-studio.css`
- `public/emoji-picker-popup.css`

They are not allowed to become a second product-wide design system.

If a change affects page rhythm, cards, layout proportions, typography hierarchy, standard controls, navigation or responsiveness across modules, change `public/raku-prism-v400.css`.

## Spacing contract

Canonical tokens are defined in `:root` inside `raku-prism-v400.css`:

- `--p-gap-xl: 30px`
- `--p-gap: 22px`
- `--p-gap-sm: 14px`
- `--p-pad-xl: 30px`
- `--p-pad: 22px`
- `--p-control: 46px`
- `--p-r-xl: 26px`
- `--p-r-lg: 19px`
- `--p-r-md: 14px`
- `--p-r-sm: 10px`

Do not invent a competing spacing scale in a module for outer layout.

## Screen-state contract

Login, server picker and guild dashboard are three mutually exclusive app screens.

Visibility is controlled by application state through the `.hidden` class. Design CSS must never override or reinterpret that state.

`public/index.html` contains the hard visibility contract for:
- `#loggedOut.hidden`
- `#serverList.hidden`
- `#guildDashboard.hidden`

## Readability contract

- Normal interface text: roughly 12–15px.
- Helper text: roughly 10–11px.
- 8–9px is only for technical metadata, uppercase labels and counters.
- Main module titles must be immediately scannable.
- Text contrast must remain sufficient without backdrop blur support.
- Primary actions must be identifiable by structure and contrast, not glow alone.

## Complex module layout

Role Studio, Ticket Studio, Creator Hub and Voice Studio share the same desktop logic:

1. module hero
2. optional module toolbar/status
3. left-side list/navigation when required
4. large primary work area
5. secondary preview/status area

Their proportions should converge instead of drifting independently.

## Loading rules

Design CSS is loaded synchronously in `public/index.html`.

Load order:
1. base/component CSS
2. `public/raku-prism-v400.css` last

There must be exactly one final product-wide visual layer.

Never dynamically inject design CSS from JavaScript. `public/save-button-fix.js` remains behavior-only.

## Forbidden pattern

Do not add files named or conceptually equivalent to:
- `*-fix.css`
- `*-polish.css`
- `*-override.css`
- `*-readability.css`
- per-module versioned visual patches

If Prism OS needs improvement, edit Prism OS.

## Responsive contract

Shared outer-layout breakpoints live in `raku-prism-v400.css`:
- 1500px
- 1240px
- 1050px
- 760px
- 520px

Module CSS may retain internal component breakpoints only where necessary.
