# RAKU Discord Control — Glass UI v3

## Canonical visual layer

`public/raku-glass-v300.css` is the **only** product-wide visual layer.

It owns the complete look and feel of the product:
- login
- server picker
- top bar and server command bar
- navigation
- overview
- all module shells
- shared spacing
- typography hierarchy
- surfaces, glass, blur, borders, shadows and radii
- form-control sizing
- outer editor/preview layouts
- shared responsive behavior

The target aesthetic is **dark smoked glass**: subtle transparency, restrained blur, high contrast and readable text. Glass is used on major surfaces, not every tiny nested element.

## Module CSS

Module CSS files remain responsible for component mechanics and module-specific structure only:

- `public/styles.css`
- `public/commands-editor.css`
- `public/role-studio.css`
- `public/ticket-studio.css`
- `public/creator-hub.css`
- `public/voice-studio.css`
- `public/analytics-studio.css`
- `public/emoji-picker-popup.css`

Do **not** add another global `fix`, `polish`, `override`, `wide`, `readability` or version-specific module stylesheet.

If a visual rule affects multiple pages or controls the outer layout of a module, it belongs in `raku-glass-v300.css`.

## Spacing contract

The canonical tokens are defined in `:root` inside `raku-glass-v300.css`:

- `--g-gap-xl: 26px` — large visual separation
- `--g-gap: 20px` — standard module/column spacing
- `--g-gap-sm: 14px` — card stacks and internal sections
- `--g-gap-xs: 8px` — compact controls
- `--g-pad-xl: 28px` — hero/large content padding
- `--g-pad: 22px` — standard card padding
- `--g-pad-sm: 16px` — compact card padding
- `--g-control: 44px` — standard input/button height
- `--g-radius-xl: 22px` — feature surfaces
- `--g-radius-lg: 17px` — primary cards
- `--g-radius-md: 13px` — nested cards
- `--g-radius-sm: 10px` — controls

Do not invent another spacing scale inside an individual module unless its component mechanics genuinely require it.

## Readability contract

- Normal UI text should stay around 12–15px.
- Secondary/helper text should normally stay at 10–11px.
- 8–9px text is reserved for compact technical labels, counters and uppercase metadata only.
- Primary actions must be visually obvious without relying on glow alone.
- Major cards must have enough contrast to remain readable when backdrop blur is unavailable.

## Layout contract

Complex modules use the same desktop pattern:

1. module hero
2. optional guidance/status strip
3. module sidebar/list where needed
4. large editor/work area
5. live preview/status column

Role Studio, Ticket Studio, Creator Hub and Voice Studio should converge to the same proportions instead of defining unrelated page geometries.

## Loading rules

Design CSS is loaded synchronously in `public/index.html`.

`public/save-button-fix.js` must never load CSS or other visual assets.

Load order:
1. base/component CSS
2. `raku-glass-v300.css` last

There must be exactly **one** product-wide visual layer.

## Responsive contract

Shared layout breakpoints live in `raku-glass-v300.css`:

- 1500px — reduce dense desktop grids
- 1240px — stack preview/editor columns
- 1040px — stack app/sidebar layouts
- 760px — mobile layout
- 520px — narrow mobile layout

Module CSS may keep component-specific breakpoints, but must not redefine the outer product layout.

## Rule of thumb

If a design change can be described as “the app should…”, it belongs in `raku-glass-v300.css`.
If it can only be described as “this one component internally needs…”, it belongs in the module CSS.
