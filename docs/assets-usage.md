# Tiny Swords Asset Usage Guide

This project is prepared for Pixel Frog Tiny Swords assets from:

- https://pixelfrog-assets.itch.io/tiny-swords
- https://pixelfrog-assets.itch.io/tiny-swords/devlog/1138989/tilemap-guide

## License notes

- Allowed: personal and commercial use, including modified versions.
- Credit: not required (but recommended).
- Not allowed: redistributing/repackaging raw or modified asset files as an asset pack.

## Recommended folder structure

Current terrain integration uses these exact files:

- `TinySwords/Terrain/Tileset/Tilemap_color1.png` through `Tilemap_color6.png`
- `TinySwords/Terrain/Tileset/Water Background color.png`
- `TinySwords/Terrain/Tileset/Water Foam.png`
- `TinySwords/Terrain/Tileset/Shadow.png`
- `TinySwords/Buildings/Blue Buildings/Barracks.png`
- `TinySwords/Buildings/Red Buildings/Barracks.png`

If your filenames differ, update `src/game/assets.js`.

## Tiles and grid

- Project grid is `20x25`.
- Tiny Swords tile guide uses `64x64` tiles and `10fps` animation.
- Keep consistent tile size in `src/game/constants.js`.

## Towers: visual size vs gameplay footprint

Use this rule for all tower types:

- **Gameplay footprint** stays `1 tile` (`64x64`).
- **Visual sprite** can be taller (for example `64x128`) to look like a tower.
- **Anchor** tower sprites at bottom-center: `setOrigin(0.5, 1)`.
- **Snap position** to tile bottom-center:
  - world position from `cellToWorld(cellX, cellY)`
  - render at `x = world.x`, `y = world.y + TILE_SIZE / 2`

This keeps towers readable and tall while allowing adjacent placements on neighboring cells.

### Current implementation reference

- Placement logic and occupancy: `src/game/systems/TowerSystem.js`
  - Build validity and occupancy (`cellOccupancy`) remain tile-based.
  - Render uses `setDisplaySize(TILE_SIZE, TILE_SIZE * 2)` and bottom-center origin.
- Placement ghost preview: `src/scenes/GameScene.js`
  - Ghost uses the same size/origin/position rules as final placement.
  - Ghost snaps to tile bottom-center in `updateTowerGhost`.

### Checklist for adding a new tower type

1. Add a new image asset key in `src/game/assets.js`.
2. Keep occupancy keying tile-based (`cellX,cellY`) in tower placement logic.
3. Render sprite with:
   - `setOrigin(0.5, 1)`
   - `setDisplaySize(TILE_SIZE, TILE_SIZE * 2)` (or another approved tall size)
   - position at `cellToWorld(...).y + TILE_SIZE / 2`
4. Apply the same transform to the placement ghost preview.
5. Keep tower runtime data (`x`,`y`) at tile center for range/combat/minimap consistency.
6. Verify two neighboring cells can both place towers (no visual size should change footprint).

## UI: BigBar (blue barracks HP)

- **Base:** `TinySwords/UI Elements/UI Elements/Bars/BigBar_Base.png` — **320×64** pixels, i.e. **(5×64)×64**: one row of five **64×64** cells.
- **Which cells are art (1-based columns):** column **1** = left cap, column **3** = tileable middle, column **5** = right cap. Columns **2** and **4** are **empty spacers** in the PNG; do not use them as visible frames.
- **Phaser frames (0-based):** **0** = left, **2** = middle (repeat for bar width), **4** = right. Skip frames **1** and **3**.
- **Fill:** `BigBar_Fill.png` is **64×64**; drawn inside the base recess (see `src/game/ui/BlueBarracksHpBar.js`).

## UI: SmallBar (enemy unit HP)

- **Base:** `TinySwords/UI Elements/UI Elements/Bars/SmallBar_Base.png` — **320×64** pixels, i.e. **(5×64)×64**.
- **Phaser frames (0-based):** **0** = left cap, **2** = tileable middle, **4** = right cap. Frames **1** and **3** are spacer cells.
- **Fill:** `SmallBar_Fill.png` is **64×64**; the painted fill band is a thin strip around **y=30..32**, so rendering uses source crop + display scaling.
- **Implementation:** enemy bars use `src/game/ui/UnitHpBar.js` and are attached in `src/game/systems/EnemySystem.js`.

## Elevation model (four paint layers)

Maps use four explicit `layerTiles` grids plus a single **elevation** grid per cell:

| Value | Layer |
|-------|--------|
| `0` | Water |
| `1` | Ground level 1 |
| `2` | Ground level 2 |
| `3` | Ground level 3 |

Additional grids:

- **`buildings`**: `null` or a string key (`"barracks_blue"`, `"barracks_red"`) — occupied cells are not buildable.
- **`layerTiles`**: four `height × width` grids of `null` or `{ "sheet": "terrainColor1", "frame": number }`. The map editor paints these directly.
- **`tileOverrides`** and **`decorations`**: legacy import fields. They are migrated into `layerTiles` by `ensureMapLayerTiles` in `src/game/maps/mapUtils.js`.
- **`stairs`**: legacy grid retained for old JSON compatibility; the current map editor no longer paints stairs.

## Terrain layer order (rendering)

Implemented in `src/scenes/GameScene.js` (`redrawTerrain`):

1. Draw `layerTiles[0]` through `layerTiles[elevation[y][x]]`, skipping empty layer slots.
2. Draw path-mask debug overlay when the editor is open.
3. Draw building sprites from the `buildings` grid.

## Terrain control points

- Default map loader and migration: `src/game/maps/map-001.js`
- Layer-grid helpers: `src/game/maps/mapUtils.js` (`ensureMapLayerTiles`, `recomputeCellElevationFromLayerTiles`)
- Barracks positions: `buildings` grid + `points.homeBarracks` / `points.enemyBarracks` (kept in sync via `src/game/maps/mapUtils.js` — `syncBarracksPointsFromBuildings`)

## In-game map editor

Press **`E`** to toggle the editor (gameplay pauses while editing; **`P`** does not unpause during edit).

| Key | Action |
|-----|--------|
| `1` | Select layer 0 (water) |
| `2` | Select layer 1 (ground level 1) |
| `3` | Select layer 2 (ground level 2) |
| `4` | Select layer 3 (ground level 3) |
| `5` | Move building — click barracks, then destination cell |
| `6` | Select tool — click map to select one cell; hold `Shift` while clicking to add more cells |
| `Ctrl+S` | Save map in browser storage (persists across refresh) |
| `Ctrl+O` | Import map JSON (file picker) |

UI: DOM side panel in `#editor-panel` (see `index.html` layout next to `#app`). Logic: `src/game/editor/MapEditor.js`, panel: `src/game/editor/EditorPanel.js`.

**Map tab** — layer + drag brush:

- Pick **Layer 0–3**, choose a tile from any loaded terrain color sheet, then **drag on the map** to paint `layerTiles`.
- **Eraser** checkbox clears the active layer while dragging.
- The asset picker is unified; there is no terrain/decoration mode split.

**Objects tab** — separate from terrain editing:

- **Place building** — choose blue/red barracks, drag on land to stamp `buildings`.
- **Move building** — two-click move for existing barracks.
- **Path mask** — drag to paint enemy route cells (Shift erases).

Optional **Bulk** section on Map tab: select multiple cells (Shift-add) and apply or clear the active layer in one click.

Save/export/import via the File section. Save writes to browser local storage (`solo-td:map-editor:map001`).

## Map JSON format (export / import)

```json
{
  "id": "map-001",
  "version": 1,
  "width": 20,
  "height": 25,
  "bgColor": 2969469,
  "points": {
    "homeBarracks": { "x": 10, "y": 3 },
    "enemyBarracks": { "x": 10, "y": 20 }
  },
  "tilesets": {
    "shore": "default",
    "plateau": "rocks"
  },
  "elevation": [[0, 0, 1]],
  "stairs": [[0, 0, 0]],
  "buildings": [[null, "barracks_blue", null]],
  "layerTiles": [
    [[null, null, null]],
    [[null, { "sheet": "terrainColor1", "frame": 10 }, null]],
    [[null, null, null]],
    [[null, null, { "sheet": "terrainColor3", "frame": 42 }]]
  ],
  "pathMask": [[0, 1, 0]]
}
```

Import requires `version === 1` and dimensions matching the running grid (`20×25`). Older exports with `tileOverrides` or `decorations` are migrated into `layerTiles`.

## Tuning guide

- To swap grass palette: replace `Tilemap_color1.png` path with another `Tilemap_colorX.png` in `src/game/assets.js`.
- To move barracks in data: set `buildings` cells and `points`, or use the in-game editor / JSON import.
- To tune enemy spawn cadence and pressure: edit `redBarracksSpawner` in `src/game/balance.js`.
- Red spawns currently target Blue directly (not path-following): `src/game/systems/EnemySystem.js`.

## Sprite sheet integration

- Sprite sheet registrations live in `src/game/assets.js`.
- Adjust frame sizes if your sheet export uses different dimensions.
- Create animation definitions using the exported `animationDefaults`.

## Packaging reminder

When publishing game builds, include only files needed by the game itself.
Do not upload or distribute the whole raw Tiny Swords package as a standalone download.
