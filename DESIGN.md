# RAKU Discord Control — Design System Rules

## Canonical visual layer

`public/raku-design-v200.css` is the **only** product-wide design/spacing layer.

It owns:
- page and module spacing
- surfaces, borders, shadows and radii
- typography hierarchy
- common form-control sizing
- responsive breakpoints
- the shared module header/hero rhythm
- outer layouts for Role Studio, Ticket Studio, Creator Hub, Commands, Voice and Analytics

## Module CSS

Module CSS files remain responsible for component mechanics and module-specific internals only:

- `public/commands-editor.css`
- `public/role-studio.css`
- `public/ticket-studio.css`
- `public/creator-hub.css`
- `public/voice-studio.css`
- `public/analytics-studio.css`
- `public/emoji-picker-popup.css`

Do **not** introduce another global polish/fix/override stylesheet. If a shared spacing, surface or responsive rule changes, change `raku-design-v200.css`.

## Spacing contract

The canonical tokens live in `:root` inside `raku-design-v200.css`.

- `--ds-gap: 18px` — main module/column spacing
- `--ds-gap-sm: 14px` — card stacks and internal major spacing
- `--ds-gap-xs: 8px` — compact controls
- `--ds-pad: 18px` — normal card padding
- `--ds-pad-lg: 22px` — module hero padding
- `--ds-radius-lg: 16px` — major surfaces
- `--ds-radius-md: 12px` — nested cards
- `--ds-radius-sm: 9px` — controls/buttons
- `--ds-control-h: 42px` — standard input/button height

## Loading rules

Design CSS is loaded synchronously in `public/index.html`.

`public/save-button-fix.js` must never load CSS or visual assets. Runtime design injection is prohibited because it makes cascade order timing-dependent.

The load order is:
1. base app CSS
2. module component CSS
3. `raku-design-v200.css` last

## Responsive contract

Use the shared breakpoints already defined in `raku-design-v200.css`:

- 1500px — reduce desktop column widths
- 1250px — stack preview/editor columns
- 1050px — stack module sidebars/navigation
- 760px — mobile layout

Avoid module-specific breakpoints for outer layout unless the component genuinely cannot use the shared breakpoints.

## Rule of thumb

If a change affects more than one module, it belongs in `raku-design-v200.css`.
If a change affects only the mechanics of one module component, it belongs in that module's base CSS.
