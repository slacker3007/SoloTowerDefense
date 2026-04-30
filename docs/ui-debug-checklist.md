# UI Debug Checklist

Use this workflow for HUD bugs where data exists but behavior/rendering is inconsistent.

## 1) Classify The Symptom First

Pick the closest symptom category before changing code:

- Data missing: tooltip/title/cost fields are not built.
- Render missing: data exists, but UI does not display it.
- Timing/state race: value appears briefly, flickers, or never persists.
- Interaction mismatch: hover/click/hit area does not match visuals.

This prevents jumping into layout edits when the issue is upstream.

## 2) Trace Ownership Of The Broken State

For action-slot and tooltip issues, identify:

- Who writes state? (`updateHudActions`, `setActionSlots`, pointer handlers)
- Who reads state for rendering? (`layout`, `showActionTooltip`)
- How often writes happen? (frame loop, selection changes, mode changes)

For this project, hover label visibility depends on `_hoveredActionIndex`, so any frequent reset path is high priority.

## 3) Verify Data Before Visuals

Check slot content at the point it is built in `GameScene.updateHudActions()`:

- `label`
- `tooltipTitle`
- `tooltipDescription`
- `tooltipCost`
- `tooltipWarning`

If data is correct there, move to HUD state and rendering. Do not rewrite balance metadata first.

## 4) Audit Refresh Frequency

If hover UI is unstable, inspect repeated calls:

- `GameScene.update()` calls `updateHudActions()` each frame.
- `Hud.render()` calls `layout()` repeatedly.
- `setActionSlots()` can overwrite transient hover state.

Common failure mode:

- pointer enters button
- hover index set
- next slot refresh resets hover index
- inline label never becomes visible

## 5) Gate Layout Off Effective Visibility

Only apply layout offsets/styles when UI is actually visible.

For inline text near icons:

- Correct gate: `showInlineLabel`
- Incorrect gate: `slot.label` only

If you offset button position for hidden text, click targets can drift from intended icon locations.

## 6) Use Minimal, Temporary Instrumentation

Instrumentation should answer one hypothesis at a time:

- entry/exit state values (`hoveredBefore`, `hoveredAfter`)
- whether slot data contains expected fields
- whether render gate evaluates true/false

Rules:

- Keep logs tightly scoped to suspected path.
- Remove logs immediately once hypothesis is confirmed.
- Prefer local debug-only changes over broad instrumentation.

## 7) Fast Repro Loop

Use one deterministic scenario:

1. Select basic tower.
2. Hover one conversion icon.
3. Observe: inline label + tooltip both appear.
4. Move pointer out.
5. Observe: inline label + tooltip both clear.

Then repeat for non-basic upgrade tooltip slots.

## 8) Regression Sweep Before Closing

After fixing one HUD issue, verify all related paths:

- Barracks craft tooltips
- Basic conversion grid tooltips
- Hover-only conversion inline labels
- Non-basic upgrade tooltips
- Disabled-state warning text

## 9) Cleanup Checklist

Before finalizing:

- Remove all temporary instrumentation.
- Remove debug-only comments/regions.
- Confirm no stale logging calls in `GameScene` or `Hud`.
- Run lint checks on edited files.

## Related Docs

- Tower action behavior and data flow: `docs/tower-action-ui.md`
- Action slot coordinate mapping: `docs/ui/action-grid.md`
