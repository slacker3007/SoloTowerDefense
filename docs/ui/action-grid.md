# Selected-Building Action Grid

This document defines the selected-building HUD action panel as a fixed outer frame of `6x5` cells with an interactive inner grid of `4x3` cells.

## Coordinate Systems

- Frame grid:
  - `frameRow: 1..5`
  - `frameCol: 1..6`
- Inner action grid (playable/action cells only):
  - `innerRow: 1..3`
  - `innerCol: 1..4`

The inner grid is inset by one frame cell from each side:

- `frameRow = innerRow + 1`
- `frameCol = innerCol + 1`

## Smart Slot Addressing

All action placement must use `(innerRow, innerCol)` coordinates, not implicit array order.

Row-major slot conversion:

- `slotIndex1Based = (innerRow - 1) * 4 + innerCol`
- `slotIndex0Based = slotIndex1Based - 1`

Reverse conversion:

- `innerRow = floor(slotIndex0Based / 4) + 1`
- `innerCol = (slotIndex0Based % 4) + 1`

## Reference Matrix (Inner 4x3)

| innerRow \\ innerCol | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| 1 | 1 (0) | 2 (1) | 3 (2) | 4 (3) |
| 2 | 5 (4) | 6 (5) | 7 (6) | 8 (7) |
| 3 | 9 (8) | 10 (9) | 11 (10) | 12 (11) |

Each cell shows `1-based slot (0-based slot)`.

Examples:

- `(row 1, col 1) = Build` places Build into slot `1` (`0` in code).
- `(row 3, col 4) = Back` places Back into slot `12` (`11` in code).

## Action Placement Contract

Action definitions should use:

```js
{
  innerRow: 1,        // 1..3
  innerCol: 1,        // 1..4
  actionId: "craftTower",
  label: "",          // use empty string for icon-only button
  enabled: true,
  iconKey: "buildIcon05", // optional
}
```

Placement rules:

- Out-of-range coordinates are invalid.
- Duplicate `(innerRow, innerCol)` entries are invalid.
- The converter builds a 12-slot array for `Hud.setActionSlots()`.

## Mode Examples

- `barracksMain`
  - `(1,1)`: Icon_01 (`buildIcon01`) -> `openCraftMenu`
- `barracksCraftMenu`
  - `(1,1)`: Icon_05 (`buildIcon05`) -> `craftTower`
  - `(3,4)`: Icon_08 (`hammerIcon08`) -> `backFromCraft`
- `towerMenu`
  - `(1,1)`: Sell (`sellTower`)
  - `(3,4)`: Icon_08 (`hammerIcon08`) -> `clearSelection`
