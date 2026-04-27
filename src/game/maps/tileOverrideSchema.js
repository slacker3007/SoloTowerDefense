/** Default sheet for legacy numeric terrain overrides in JSON. */
export const DEFAULT_TERRAIN_SHEET = "terrainColor1";

/** Spritesheet keys for TinySwords terrain tilemaps (editor picker). */
export const TERRAIN_TILE_SHEETS = ["terrainColor1", "terrainColor2", "terrainColor3", "terrainColor4", "terrainColor5", "terrainColor6"];

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
