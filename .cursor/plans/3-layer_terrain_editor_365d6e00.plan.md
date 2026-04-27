---
name: 3-layer terrain editor
overview: Refactor the map data model around a unified per-cell elevation grid (0=water, 1=grass, 2=high ground), add an in-game editor mode that paints elevation and moves buildings, and select Tiny Swords tile frames automatically based on neighbor masks.
todos:
  - id: elevation_module
    content: Add src/game/maps/elevation.js with createElevation + deriveLayers (islandMask, highGround, groundEdges, highGroundEdges, waterFoam)
    status: completed
  - id: refactor_map001
    content: Refactor src/game/maps/map-001.js to build from a single elevation grid (0=water, 1=grass, 2=plateau) plus stairs and buildings grids
    status: completed
  - id: tile_rules
    content: "Extend src/game/maps/tileRules.js: rename to getShoreFrameIndex, add HIGH_GROUND_TILE_BY_MASK and getHighGroundFrameIndex, update isBuildable"
    status: completed
  - id: redraw_terrain
    content: Refactor GameScene.drawTerrain to render from elevation + derived layers into a container, and expose redrawTerrain()
    status: completed
  - id: editor_controller
    content: "Add src/game/editor/MapEditor.js: tool state, pointer paint, building move, JSON export/import"
    status: completed
  - id: editor_hud
    content: Add src/game/editor/EditorHud.js for the editor overlay (tool, elevation, hotkeys)
    status: completed
  - id: scene_wiring
    content: "Wire editor into GameScene: E hotkey toggle, route pointer events to editor first, pause gameplay while editing, suppress tower placement"
    status: completed
  - id: docs
    content: "Update docs/assets-usage.md: document 3-layer elevation model, plateau autotile, editor hotkeys, JSON format"
    status: completed
isProject: false
---

## Goals

1. Replace ad-hoc binary layers (`islandMask`, `flatGround`, `highGround`) with a single `elevation[y][x]` grid valued in `{0, 1, 2}`.
2. Auto-select correct Tiny Swords tile frames per cell from neighbor masks (shoreline at 0/1 boundary, plateau cliff at 1/2 boundary), so painting elevation "just works".
3. Add an in-game editor mode (toggle with `E`) to paint elevation, move barracks, and export/import the map as JSON.

## Data model — single elevation grid

Source of truth becomes `elevation[y][x] in {0,1,2}`. Everything visual is derived.

New module `src/game/maps/elevation.js`:

```js
// 0 = water, 1 = grass island, 2 = high ground plateau
export function createElevation(rows, cols, fill = 0) { ... }
export function deriveLayers(elevation) {
  // returns: { islandMask, highGround, groundEdges, highGroundEdges, waterFoam }
  // islandMask[y][x] = elevation[y][x] >= 1 ? 1 : 0
  // highGround[y][x] = elevation[y][x] >= 2 ? 1 : 0
  // groundEdges = islandMask cells with at least one water neighbor
  // highGroundEdges = highGround cells with at least one non-highGround neighbor
  // waterFoam = water cells adjacent to islandMask
}
```

Refactor [src/game/maps/map-001.js](src/game/maps/map-001.js): build `elevation` once (water everywhere, then island rectangle = 1, then plateau rectangle = 2), keep separate `stairs` and `buildings` grids, and stop exporting derived masks. Provide:

```js
export const map001 = {
  id, width, height, bgColor,
  points: { homeBarracks, enemyBarracks },
  elevation,    // 2D array of 0/1/2
  stairs,       // 0/1
  buildings,    // string|null per cell, e.g. "barracks_blue"
};
```

A small helper `buildable(map, x, y)` lives in `tileRules.js` and is computed: `elevation >= 1 && stairs === 0 && buildings === null`.

## Auto-asset selection

Extend [src/game/maps/tileRules.js](src/game/maps/tileRules.js):

- Keep `SHORE_TILE_BY_MASK` and rename helper to `getShoreFrameIndex(islandMask, x, y, w, h)` — same logic, derived from `elevation >= 1`.
- Add `HIGH_GROUND_TILE_BY_MASK` mirroring shore mapping but using frame indices that point to plateau cliff tiles in `TinySwords/Terrain/Tileset/Tilemap_color1.png`. Same bitmask convention `N|E<<1|S<<2|W<<3`, with values pointing to plateau corner/edge frames. Provide a sensible default plus a comment block explaining how to tweak indices, mirroring how `SHORE_TILE_BY_MASK` is documented today.
- New `getHighGroundFrameIndex(highGround, x, y, w, h)` returns `null` for non-plateau cells.

Render order in [src/scenes/GameScene.js](src/scenes/GameScene.js)`drawTerrain()`:

1. Water background image on every cell.
2. Foam animation on `waterFoam` cells (currently disabled — leave hook).
3. Grass/shore sprite on cells where `elevation >= 1` using `getShoreFrameIndex`.
4. Plateau/cliff sprite on cells where `elevation >= 2` using `getHighGroundFrameIndex` (replaces the current colored rectangle in lines 98-110).
5. Stairs sprite on `stairs` cells (keep current placeholder for now).
6. Buildings (barracks) at building positions.

`drawTerrain()` is split into a `clearTerrain()` + `redraw()` pair so the editor can re-run it after each edit. All sprites/graphics created go into a `this.terrainContainer = this.add.container()` so a single `removeAll(true)` clears everything cleanly.

## Editor mode

New folder `src/game/editor/`:

- `src/game/editor/MapEditor.js` — controller:
  - `enabled` flag, current `tool` (`"paint" | "moveBuilding"`), current `paintElevation` (0/1/2 or `"stairs"`), selected building id when moving.
  - Pointer handlers: paint on drag for elevation tool; click-to-pick / click-to-drop for building tool.
  - Edits mutate `map.elevation` / `map.stairs` / `map.buildings` / `map.points`, then call `gameScene.redrawTerrain()`.
  - `exportJson()` triggers a Blob download of the current map; `importJson(file)` validates and replaces map state.
- `src/game/editor/EditorHud.js` — small text overlay (top-right) showing current tool, elevation level, and hotkeys.

Hotkeys when editor is on:

- `1` water (elev 0), `2` grass (elev 1), `3` high ground (elev 2), `4` stairs toggle.
- `5` move-building tool (click barracks → click destination cell).
- `Ctrl+S` export JSON, `Ctrl+O` import JSON (file input).
- `E` toggles editor on/off; while on, gameplay is paused (`gameState.paused = true`) and tower placement on left-click is disabled.

Wiring in [src/scenes/GameScene.js](src/scenes/GameScene.js):
- Construct `this.editor = new MapEditor(this, this.map)` in `create()`.
- In `bindInput()`, route `pointerdown`/`pointermove`/`pointerup` through the editor first; if the editor consumed it, skip tower placement.
- Add `keydown-E` to toggle editor.

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
  "elevation": [[0,0,1,...], ...],
  "stairs":    [[0,0,0,...], ...],
  "buildings": [[null, "barracks_blue", null, ...], ...]
}
```

## Files touched

- New `src/game/maps/elevation.js` — elevation grid + `deriveLayers`.
- Edit [src/game/maps/map-001.js](src/game/maps/map-001.js) — build from `elevation`, expose `elevation`, `stairs`, `buildings`.
- Edit [src/game/maps/tileRules.js](src/game/maps/tileRules.js) — `getShoreFrameIndex`, `HIGH_GROUND_TILE_BY_MASK`, `getHighGroundFrameIndex`, updated `isBuildable`.
- Edit [src/scenes/GameScene.js](src/scenes/GameScene.js) — data-driven `drawTerrain`/`redrawTerrain`, terrain container, editor wiring, `E` hotkey, pause-on-edit.
- New `src/game/editor/MapEditor.js` — tool state, pointer handlers, JSON I/O.
- New `src/game/editor/EditorHud.js` — overlay HUD.
- Edit [docs/assets-usage.md](docs/assets-usage.md) — document the elevation model, plateau autotile, editor hotkeys, JSON format.

## Out of scope (call out)

- True plateau frame indices in `HIGH_GROUND_TILE_BY_MASK` will start as a sensible guess based on the Tiny Swords tilemap layout; minor index tuning may be needed once visible (same situation `SHORE_TILE_BY_MASK` already documents).
- No path-recompute / pathfinding changes for enemies on plateau. Plateau cells will be `buildable` but not affect routing yet.
- No undo/redo stack in the editor.
- No new building types beyond the existing two barracks.