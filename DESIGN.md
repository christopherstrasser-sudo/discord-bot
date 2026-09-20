# ORBIT — Product & UI Design Contract

## Current direction: ORBIT Control

The September 2026 redesign keeps the existing server picker, labeled sidebar,
module routes and editor workflows. The user requested a complete new visual
identity around that structure, without generated images.

- Deep graphite surfaces, sage / mint accents and warm off-white typography.
- Locally hosted Inter for working text and Manrope for display typography.
- Approved `public/orbit-wordmark.svg` in the header and login.
- The server remains the center of the product; an interactive CSS orbit on the
  overview opens the corresponding operational modules.
- Colored module icons support recognition; status is always stated in text too.
- Login, server picker, overview and every editor share the same design system.
- Real server icons come from Discord. Rings and interface icons use CSS / SVG.
  Do not add generated decorative imagery.

## Canonical ownership

`public/raku-orbit-v610.css` owns product appearance: tokens, typography, the
application frame, entry screens, editor surfaces, previews and breakpoints.
`public/raku-module-shell.css` contains only shared hero structure and the native
module-toolbar contract. Feature stylesheets continue to provide their editor
mechanics. Retired global override files must not be reintroduced.

Historical `raku` filenames and globals remain internal compatibility details.
Visible product branding must always be ORBIT.

## Application structure

- Desktop: a labeled left navigation, workspace context and actions in the header.
- Mobile: an explicit menu button opens the same labeled navigation.
- One shrinkable content canvas; the same outer width for every module.
- Shared module hero: purpose, three setup steps and a relevant hint.
- Ctrl+K / Cmd+K opens a searchable module switcher with keyboard navigation.
- Search, filtering, saving, test and publish actions keep their existing handlers.
- Login, server picker and guild dashboard remain mutually exclusive. Never
  override `.hidden` to reveal an inactive application screen.

## Responsive and accessible behavior

Forms, side lists and previews collapse before their inputs become unusably
narrow. Dynamic names must wrap or truncate. Fixed navigation becomes a mobile
menu at 760px. Editor columns stop sticking on small screens. Every action must
retain a visible keyboard focus indicator and an accessible name. Honor reduced
motion. Do not hide any module's actual functionality to solve an overflow.

## Data and product contracts

Never invent server telemetry. The overview reads the real settings for Ticket,
Creator and Voice modules before reporting their status; unavailable status is
explicitly left open. Server counts represent members, writable channels and
manageable roles. Preview data belongs in Discord previews or isolated UI tests.

Keep all provider APIs, OAuth flows, tenant isolation and save / publish semantics
intact during visual work. Shared Bot Profile supports per-guild nickname, avatar
and bio; Discord activity/presence remains global to a shared bot. The separate
Custom Bot module may control its own bot's presence. Never recreate the retired
local-browser Instagram/X provider fallback.
