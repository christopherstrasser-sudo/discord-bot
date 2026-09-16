# RAKU Discord Control — Studio UI v5

## Current visual architecture

The product-wide UI is rebuilt around two files:

- `public/raku-studio-v500.css` — the only global visual layer
- `public/raku-workspace-v500.js` — the final dashboard shell and overview renderer

They are loaded after all module mechanics and module hooks.

## Product direction

This is a practical streamer/community administration tool, not a sci-fi control-panel demo.

The UI must therefore avoid:

- giant marketing hero cards inside the authenticated dashboard
- fake system language such as `CONTROL NODE`, `SERVER PULSE`, `CONTROL OS`, `READY` dashboards
- excessive gradients, glow, blur or decorative telemetry
- uppercase microcopy everywhere
- huge empty cards that exist only to look dramatic
- nested card-inside-card-inside-card layouts
- separate visual languages for different modules

The target is restrained and professional:

- compact application sidebar
- one slim context bar
- readable 10–14px working UI text
- 18–30px page/module titles
- real content density
- translucent surfaces only where useful
- dark neutral palette with a restrained violet accent
- clear active/disabled/success/warning states
- consistent forms, spacing and radii

## Screen architecture

Login, server picker and dashboard are mutually exclusive screens.

Dashboard structure:

1. fixed application sidebar with current server
2. grouped navigation
3. one slim context bar
4. one scrollable workspace
5. module-specific content

There must not be a second global dashboard header above this shell.

## Overview architecture

The overview is operational, not promotional:

1. compact server heading + 3 summary values
2. compact module shortcut strip
3. activity + attention panels
4. quick actions

Do not restore the old giant server hero.

## Module consistency

Existing module CSS remains responsible for component mechanics only:

- `styles.css`
- `commands-editor.css`
- `role-studio.css`
- `ticket-studio.css`
- `creator-hub.css`
- `voice-studio.css`
- `analytics-studio.css`
- `emoji-picker-popup.css`

Outer module appearance and shared layout are owned by `raku-studio-v500.css`.

Commands, Role Studio, Ticket Studio, Creator Alerts, Voice and Analytics must use the same spacing, surfaces, controls and responsive logic.

## Design tokens

The canonical scale is in `:root` of `raku-studio-v500.css`:

- `--r5-gap: 18px`
- `--r5-gap-sm: 12px`
- `--r5-pad: 18px`
- `--r5-control: 42px`
- `--r5-radius-lg: 16px`
- `--r5-radius: 12px`
- `--r5-radius-sm: 9px`

Do not create another global spacing scale.

## Retired architecture

Do not restore or reference:

- `raku-ui-v100.js`
- `raku-prism-v400.css`
- `raku-glass-v300.css`
- `raku-design-v200.css`
- UX-v2 decorators/guides/hints
- module-unification/readability/wide/fix layers
- role/ticket version-specific polish stylesheets

Do not create another `fix`, `polish`, `override`, `wide`, `readability`, `glass`, `prism` or similar global stylesheet.

## Rule

If the app starts looking like a generic AI-generated admin dashboard again, simplify the structure before adding visual effects.
