# Tower Action UI

This document describes the icon-first tower action UX and how details are surfaced through explicit info buttons.

## Why This Exists

The action panel now prioritizes instant decisions:

- 3x3 icon-first conversion grid for basic towers
- Always-visible cost badges on actionable icons
- Explicit per-slot info button for secondary details

## Source Of Truth

Tower-facing display text is centralized in `src/game/balance.js`:

- `towerUiMeta` stores descriptive copy per tower type.
- `getTowerDisplayName(towerType)` returns the UI title (for example `Fire Tower`).
- `getTowerDescription(towerType)` returns the narrative description with a safe fallback.
- `getTowerTooltipSummary(towerType)` returns concise stat text:
  - `Damage X | Rate Y/s | Range Z tiles`

This keeps tooltip text logic out of scene/HUD layout code.

## Data Flow

1. `GameScene.updateHudActions()` builds slot definitions from game state.
2. Slot definitions include:
   - details fields (`tooltipTitle`, `tooltipDescription`, `tooltipCost`, `tooltipWarning`)
   - icon UX fields (`accentColor`, `cost`, `showInfoButton`)
3. `Hud.setActionSlots()` stores slots and binds:
   - main slot click for immediate action
   - info-button click for details panel
4. `Hud.layout()` renders color accents, icon art, cost badges, and info affordances.

## Behavior By Context

### Blue Barracks Craft Menu

- Build action uses basic-tower description + summary.
- Type info row mirrors that metadata for consistency.
- Cost is also surfaced on the icon slot via `cost`.

## Basic Tower Conversion Grid (3x3)

- Grid uses nine element-themed cells in the left 3 columns:
  - archer, lightning, earth
  - fire, basic (current type marker), holy
  - ice, dark, nature
- Conversion entries use:
  - `tooltipTitle = getTowerDisplayName(cell.towerType)`
  - `tooltipDescription = getTowerDescription(...) + getTowerTooltipSummary(...)`
  - `accentColor = getTowerUiAccentColor(cell.towerType)`
  - `cost = option.cost`
- Click on an enabled element icon converts instantly.

## Non-Basic Upgrade Slots

- Upgrade slot A/B tooltip descriptions include:
  - current tower description
  - current tower summary
  - selected upgrade label
- This keeps context visible while still allowing immediate icon click for upgrade.

## Secondary Details Layer

In `src/game/ui/Hud.js`:

- Each slot can expose a small `i` info button via `showInfoButton`.
- Pressing info opens a details panel with title, description, cost, and warning text.
- Details are explicitly opened/closed (no hover requirement).

## QA Checklist

- Select Blue Barracks, open build menu:
  - Build slot shows cost directly.
  - Info button opens details with description + summary + cost.
- Select a basic tower:
  - Nine element-themed icons fill a 3x3 grid in left columns.
  - Every actionable conversion icon shows visible cost without hover.
  - Disabled entries retain visible cost and reduced alpha styling.
  - Info button opens the correct details panel content.
- Select a non-basic tower:
  - Upgrade icon shows cost badge directly.
  - Info button opens context-rich upgrade details and warnings.
- Confirm no debug instrumentation remains in scene/HUD files.

## Related Docs

- Action grid coordinate system: `docs/ui/action-grid.md`
- Reusable debugging workflow for this class of bug: `docs/ui-debug-checklist.md`
