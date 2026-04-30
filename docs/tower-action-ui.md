# Tower Action UI

This document describes how tower action text and tooltips are produced and rendered in the HUD.

## Why This Exists

The action panel now surfaces richer context so players can make decisions without memorizing tower stats:

- Per-tower descriptions and stat summaries in tooltips
- Cost and affordability warning in tooltip details
- Hover-only inline label text on conversion icon buttons

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
2. Slot definitions include `tooltipTitle`, `tooltipDescription`, `tooltipCost`, and `tooltipWarning`.
3. `Hud.setActionSlots()` stores the slot set and binds interactivity.
4. `Hud.showActionTooltip()` renders tooltip text for hovered slot.
5. `Hud.layout()` renders icon buttons and conditionally shows inline labels.

## Behavior By Context

### Blue Barracks Craft Menu

- Build action uses basic-tower description + summary.
- Type info row mirrors that metadata for consistency.
- Cost and affordability warning are provided through tooltip fields.

## Basic Tower Conversion Grid

- Conversion entries use:
  - `tooltipTitle = getTowerDisplayName(cell.towerType)`
  - `tooltipDescription = getTowerDescription(...) + getTowerTooltipSummary(...)`
- Conversion icon buttons keep `label` text, but label visibility is hover-gated in HUD.

## Non-Basic Upgrade Slots

- Upgrade slot A/B tooltip descriptions include:
  - current tower description
  - current tower summary
  - selected upgrade label
- This replaces generic upgrade-only copy and keeps context visible.

## Hover-Only Inline Label Rule

In `src/game/ui/Hud.js`:

- `showInlineLabel = Boolean(slot?.label) && this._hoveredActionIndex === i`
- Label text is rendered only when slot index is currently hovered.
- Icon-adjacent button positioning applies only when `showInlineLabel` is true.

This prevents always-on labels and avoids interaction/hit-area drift.

## Hover State Stability

`setActionSlots()` preserves hover when valid:

- Save previous hovered index
- Rebind slots
- Restore hover index only if that slot still exists and has tooltip content
- Otherwise hide tooltip/reset hover state

This avoids flicker or missing hover labels during frequent action slot refreshes.

## QA Checklist

- Select Blue Barracks, open build menu:
  - Build tooltip shows basic description + stat summary + cost.
- Select a basic tower:
  - Conversion icons show tooltip title/description/cost for each target tower.
  - Inline label appears only while hovering a conversion icon.
  - Inline label disappears on pointer out.
- Select a non-basic tower:
  - Upgrade A/B tooltip descriptions include tower context and upgrade label.
  - Disabled upgrade states show affordability warning.
- Confirm no debug instrumentation remains in scene/HUD files.

## Related Docs

- Action grid coordinate system: `docs/ui/action-grid.md`
- Reusable debugging workflow for this class of bug: `docs/ui-debug-checklist.md`
