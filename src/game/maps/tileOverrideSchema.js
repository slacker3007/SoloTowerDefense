/** Default sheet for legacy numeric terrain overrides in JSON. */
export const DEFAULT_TERRAIN_SHEET = "terrainColor1";

/** Spritesheet keys for TinySwords terrain tilemaps (editor picker). */
export const TERRAIN_TILE_SHEETS = ["terrainColor1", "terrainColor2", "terrainColor3", "terrainColor4", "terrainColor5", "terrainColor6"];

/** Numbered map editor terrain layers: 0 water, 1-3 ground levels. */
export const MAP_TILE_LAYER_COUNT = 4;

/** Map editor: extra spritesheet used only for decorations (not terrain overrides). */
export const SHEEP_IDLE_SHEET_KEY = "sheepIdleSheet";

/** Decoration-only spritesheet keys (editor may set `pickerSheet` when role is decoration). */
export const DECORATION_SPRITE_SHEETS = [SHEEP_IDLE_SHEET_KEY];

/** Standalone image keys placed as decorations from the editor. */
export const DECORATION_IMAGE_KEYS = ["blueHouse2", "redHouse2", "blueTower"];

/**
 * @param {unknown} v
 * @returns {{ sheet: string, frame: number } | null}
 */
export function normalizeTerrainTileOverride(v) {
  if (v == null) {
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return { sheet: DEFAULT_TERRAIN_SHEET, frame: v };
  }
  if (typeof v === "object" && v !== null) {
    const o = /** @type {Record<string, unknown>} */ (v);
    if (typeof o.sheet === "string" && typeof o.frame === "number" && Number.isFinite(o.frame)) {
      return { sheet: o.sheet, frame: o.frame };
    }
  }
  return null;
}

/**
 * @param {{ sheet: string, frame: number } | null} cell
 */
export function cloneTerrainTileOverride(cell) {
  if (cell == null) {
    return null;
  }
  return { sheet: cell.sheet, frame: cell.frame };
}

/**
 * @param {unknown} v
 * @returns {{ sheet: string, frame: number } | null}
 */
export function normalizeLayerTile(v) {
  return normalizeTerrainTileOverride(v);
}

/**
 * @param {{ sheet: string, frame: number } | null} cell
 */
export function cloneLayerTile(cell) {
  return cloneTerrainTileOverride(cell);
}
