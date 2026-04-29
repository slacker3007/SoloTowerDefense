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

- `TinySwords/Terrain/Tileset/Tilemap_color1.png`
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

## Elevation model (three layers)

Maps use a single **elevation** grid per cell:

| Value | Layer |
|-------|--------|
| `0` | Water |
| `1` | Island / grass (land) |
| `2` | High ground (plateau on top of land) |

Additional grids:

- **`stairs`**: `0` or `1` — stairs overlay (not buildable when set).
- **`buildings`**: `null` or a string key (`"barracks_blue"`, `"barracks_red"`) — occupied cells are not buildable.
- **`tileOverrides`**: `null` or a frame index (number) — per-cell manual terrain frame from the autotile sheet (`terrainColor1`). When set, replaces autotile for that cell: shore layer if `elevation` is 1, plateau layer if `elevation` is 2.
- **`decorations`**: `null` or `{ "sheet": "terrainColor1", "frame": number }` — one extra sprite drawn above terrain and below stairs/buildings (picker currently uses `terrainColor1` only).

Derived masks for rendering and foam are computed in `src/game/maps/elevation.js` (`deriveLayers`).

## Terrain layer order (rendering)

Implemented in `src/scenes/GameScene.js` (`redrawTerrain`):

1. Water background image on every cell
2. Animated foam on water cells next to land (`waterFoam` from `deriveLayers`)
3. Grass / shoreline tiles on all land cells (`elevation >= 1`) via `getShoreFrameIndex` in `src/game/maps/tileRules.js` (preset from `map.tilesets.shore`)
4. Plateau overlay on `elevation >= 2` via `getHighGroundFrameIndex` (preset from `map.tilesets.plateau`; default `rocks` uses the right-hand rock-cliff tiles in `Tilemap_color1.png`). Either pass may use `map.tileOverrides[y][x]` when set.
5. Stairs placeholder graphics
6. Decoration sprites from `map.decorations` (sheet + frame), when the texture exists
7. Building sprites from the `buildings` grid

## Island and shoreline control points

- Default island layout: `src/game/maps/map-001.js` (`islandInset`, fills `elevation`, `stairs`, `buildings`)
- Mask derivation: `src/game/maps/elevation.js` (`deriveLayers`)
- Shoreline autotile: `src/game/maps/tileRules.js` (`TILESET_PRESETS.shore`, `getShoreFrameIndex`; `getTerrainFrameIndex` is an alias)
- Plateau autotile: `TILESET_PRESETS.plateau`, `getHighGroundFrameIndex`
- Default map presets: `map.tilesets = { shore: "default", plateau: "rocks" }` in `src/game/maps/map-001.js`
- Foam animation: `src/game/assets.js` (`createTinySwordsAnimations`)
- Barracks positions: `buildings` grid + `points.homeBarracks` / `points.enemyBarracks` (kept in sync via `src/game/maps/mapUtils.js` — `syncBarracksPointsFromBuildings`)

## In-game map editor

Press **`E`** to toggle the editor (gameplay pauses while editing; **`P`** does not unpause during edit).

| Key | Action |
|-----|--------|
| `1` | Paint water (`elevation` 0) |
| `2` | Paint grass (`elevation` 1) |
| `3` | Paint high ground (`elevation` 2) |
| `4` | Stairs brush — click toggles stairs on land |
| `5` | Move building — click barracks, then destination cell |
| `6` | Select tool — click map to select one cell; hold `Shift` while clicking to add more cells |
| `Ctrl+S` | Save map in browser storage (persists across refresh) |
| `Ctrl+O` | Import map JSON (file picker) |

UI: DOM side panel in `#editor-panel` (see `index.html` layout next to `#app`). Logic: `src/game/editor/MapEditor.js`, panel: `src/game/editor/EditorPanel.js`. **Select tool** + **Tile picker**: choose Terrain override or Decoration, click one or more cells on the map (Shift-add), then click a tile in the full `Tilemap_color1` strip. The panel includes a **Save map** button and saved/unsaved status; save writes to browser local storage and is auto-loaded on next refresh.

**Tileset presets** — choose which region of `Tilemap_color1.png` drives autotiles:

- **Shore**: `default` (left half, grass/water shoreline).
- **Plateau**: `rocks` (right half, grass on rock cliffs) or `mirrorShore` (same frames as shore default).

Add presets by extending `TILESET_PRESETS` in `src/game/maps/tileRules.js` (each entry: `byMask` map + `fallback` frame index).

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
  "tileOverrides": [[null, 10, null]],
  "decorations": [[null, { "sheet": "terrainColor1", "frame": 42 }, null]]
}
```

Import requires `version === 1` and dimensions matching the running grid (`20×25`). If `tilesets` is omitted, defaults `{ shore: "default", plateau: "rocks" }` are applied (`ensureMapTilesets` in `src/game/maps/mapUtils.js`).

## Tuning guide

- To make the island larger/smaller: change `islandInset` in `src/game/maps/map-001.js`.
- To swap grass palette: replace `Tilemap_color1.png` path with another `Tilemap_colorX.png` in `src/game/assets.js`.
- If shoreline frames look incorrect: edit `TILESET_PRESETS.shore.default.byMask` / `fallback` in `src/game/maps/tileRules.js`.
- If plateau / rock frames look wrong: edit `TILESET_PRESETS.plateau.rocks` (or switch preset in the editor to `mirrorShore`).
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
