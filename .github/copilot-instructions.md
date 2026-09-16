# RAKU Discord Bot — current project state

## Current release

- Version: **0.18.0**
- Branch: `main`
- UI generation: **Glass UI v3**
- Canonical product-wide visual file: `public/raku-glass-v300.css`

## Critical design decision

The dashboard was fully visually rebuilt on 2026-09-16 after older layered override systems caused spacing and consistency regressions.

Do not restore or recreate these retired concepts:
- `layout-wide.css`
- `ui-fixes.css`
- `raku-ui-v100.css`
- `raku-ui-v100-overrides.css`
- `raku-ux-v2.css`
- `raku-readability-v121.css`
- `raku-visual-system-v140.css`
- `raku-visual-v141-fix.css`
- `raku-module-unification-v142.css`
- `role-studio-v150.css`
- `ticket-studio-v160.css`
- `raku-design-v200.css`
- UX-v2 runtime decorators/guides/hints

Those files/layers were intentionally removed.

## Design direction

The complete product uses one dark **smoked-glass** visual language:
- subtle translucent major surfaces
- restrained backdrop blur
- strong readability and contrast
- Discord-adjacent dark palette without cloning Discord
- blurple accent with subtle cyan highlights
- consistent radii and spacing
- minimal microcopy
- no decorative generated images
- no AI-style instructional clutter

The same visual system applies to:
- login
- server picker
- overview
- Welcome
- Auto-Roles
- Role Studio
- Ticket Studio
- Commands
- Creator Hub
- Server Logs
- Voice Studio
- Analytics
- Diagnostics

## CSS architecture

Load order in `public/index.html`:
1. base/component mechanics CSS
2. `public/raku-glass-v300.css` last

`raku-glass-v300.css` is the only product-wide design authority.
Module CSS keeps component mechanics only.

Never add another global `fix`, `polish`, `wide`, `readability` or override stylesheet.
Never dynamically inject design CSS from JavaScript.

See `DESIGN.md` for the spacing/layout contract.

## Runtime UI files

Keep:
- `public/raku-ui-v100.js` — navigation grouping and overview behavior; despite its old filename it is still active behavior, not a CSS design layer.
- `public/save-button-fix.js` — save behavior only; it must not load CSS/assets.
- module JS files for Role/Ticket/Creator/Voice/Analytics/Commands.

Removed intentionally:
- `public/raku-ux-v2.js`
- `public/raku-ux-v2-guides.js`
- `public/raku-ux-v2-hints.js`

## UX priorities

1. Consistency before adding more polish.
2. Readability before density.
3. Major editor modules should use a large work area plus a predictable preview/status column.
4. Login and server picker must feel like the same product as the dashboard.
5. Server cards retain real Discord server icons where available.
6. Do not generate images for the interface.

## Next work

Continue feature development from v0.18.0. If visual changes are needed, change the canonical v3 design system rather than layering another stylesheet on top.
