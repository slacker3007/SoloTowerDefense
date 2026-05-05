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

The grid still has 12 addressable slots, but tower conversion now uses an icon-first 3x3 region in columns `1..3`.

## Action Placement Contract

Action definitions should use:

```js
{
  innerRow: 1,        // 1..3
  innerCol: 1,        // 1..4
  actionId: "craftTower",
  label: "",          // use empty string for icon-only button
  enabled: true,
  iconKey: "buildIcon06", // optional
  accentColor: 0x6aa9ff,  // optional visual ring/fill tint
  cost: 100,              // optional icon badge value (gold)
  showInfoButton: true,   // optional, defaults true
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
  - `(1,1)`: Icon_06 (`buildIcon06`) -> `craftTower`
  - `(1,2)`: static type info (`Type: Basic`)
  - `(3,4)`: Icon_08 (`hammerIcon08`) -> `backFromCraft`
- `towerMenu`
  - basic tower (icon-first conversion):
    - `(1,1)`: Archer conversion icon (`upgrade:convert:archer`)
    - `(1,2)`: Lightning conversion icon (`upgrade:convert:lightning`)
    - `(1,3)`: Earth conversion icon (`upgrade:convert:earth`)
    - `(2,1)`: Fire conversion icon (`upgrade:convert:fire`)
    - `(2,2)`: Basic/current marker (disabled)
    - `(2,3)`: Holy conversion icon (`upgrade:convert:holy`)
    - `(3,1)`: Ice conversion icon (`upgrade:convert:ice`)
    - `(3,2)`: Dark conversion icon (`upgrade:convert:dark`)
    - `(3,3)`: Nature conversion icon (`upgrade:convert:nature`)
    - `(2,4)`: Sell (`sellTower`)
    - `(3,4)`: Back (`clearSelection`)
  - for non-basic towers:
    - `(1,2)`: Upgrade icon (`upgrade:level1|level2|level3`) with visible cost badge
    - `(3,1)`: Sell (`sellTower`)
    - `(3,4)`: Back (`clearSelection`)

Upgrade menu rules:

- Buttons are disabled when `gameState.gold < option.cost`.
- Barracks places only a `basic` tower; element choice is done as a tower conversion upgrade.
- Basic-tower conversion is a fixed grid (no conversion pagination).
- Cost must remain visible on icon badges even when the action is disabled.
- Info details are opened through per-slot info buttons, not hover.

Additional craft action:

- `barracksCraftMenu`
  - no tower-type cycling action
