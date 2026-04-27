import { createElevation, createNullGrid } from "./elevation";
import { cloneTerrainTileOverride, normalizeTerrainTileOverride } from "./tileOverrideSchema";

/**
 * @param {{ tilesets?: { shore?: string, plateau?: string } }} map
 */
export function ensureMapTilesets(map) {
  if (!map.tilesets || typeof map.tilesets !== "object") {
    map.tilesets = { shore: "default", plateau: "rocks" };
    return;
  }
  if (typeof map.tilesets.shore !== "string") {
    map.tilesets.shore = "default";
  }
  if (typeof map.tilesets.plateau !== "string") {
    map.tilesets.plateau = "rocks";
  }
}

/**
 * @param {{ height: number, width: number, tileOverrides?: unknown[][], decorations?: unknown[][] }} map
 */
export function ensureMapOverrideGrids(map) {
  if (!map.tileOverrides || !Array.isArray(map.tileOverrides) || map.tileOverrides.length !== map.height) {
    map.tileOverrides = createNullGrid(map.height, map.width);
  }
  if (!map.decorations || !Array.isArray(map.decorations) || map.decorations.length !== map.height) {
    map.decorations = createNullGrid(map.height, map.width);
  }
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      map.tileOverrides[y][x] = normalizeTerrainTileOverride(map.tileOverrides[y][x]);
    }
  }
}

/**
 * @param {object} map
 */
export function ensurePathMaskGrid(map) {
  if (!Array.isArray(map.pathMask) || map.pathMask.length !== map.height) {
    map.pathMask = createElevation(map.height, map.width, 0);
    return;
  }
  for (let y = 0; y < map.height; y += 1) {
    const row = map.pathMask[y];
    if (!Array.isArray(row) || row.length !== map.width) {
      map.pathMask = createElevation(map.height, map.width, 0);
      return;
    }
    for (let x = 0; x < map.width; x += 1) {
      const v = row[x];
      map.pathMask[y][x] = v === 1 ? 1 : 0;
    }
  }
}

/**
 * Copy id, bgColor, points, tilesets, and all grid cells from `source` into `target` (same dimensions).
 * @param {*} target
 * @param {*} source
 */
export function copyMapStateFrom(target, source) {
  ensureMapTilesets(source);
  ensureMapOverrideGrids(source);
  ensureMapOverrideGrids(target);
  target.id = source.id;
  target.bgColor = source.bgColor;
  target.points = {
    homeBarracks: { ...source.points.homeBarracks },
    enemyBarracks: { ...source.points.enemyBarracks },
  };
  target.tilesets = { shore: source.tilesets.shore, plateau: source.tilesets.plateau };
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      target.elevation[y][x] = source.elevation[y][x];
      target.stairs[y][x] = source.stairs[y][x];
      target.buildings[y][x] = source.buildings[y][x];
      target.tileOverrides[y][x] = cloneTerrainTileOverride(
        normalizeTerrainTileOverride(source.tileOverrides[y][x]),
      );
      const dec = source.decorations[y][x];
      target.decorations[y][x] = dec && typeof dec === "object" ? { sheet: dec.sheet, frame: dec.frame } : null;
    }
  }
  ensurePathMaskGrid(source);
  ensurePathMaskGrid(target);
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const v = source.pathMask?.[y]?.[x] === 1 ? 1 : 0;
      target.pathMask[y][x] = v;
    }
  }
  ensureMapTilesets(target);
}

/**
 * Keep `map.points` aligned with barracks cells on the buildings grid.
 * @param {{ height: number, width: number, points: { homeBarracks: {x:number,y:number}, enemyBarracks: {x:number,y:number} }, buildings: (string|null)[][] }} map
 */
export function syncBarracksPointsFromBuildings(map) {
  let home = null;
  let enemy = null;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const b = map.buildings[y][x];
      if (b === "barracks_blue") {
        home = { x, y };
      }
      if (b === "barracks_red") {
        enemy = { x, y };
      }
    }
  }
  if (home) {
    map.points.homeBarracks = home;
  }
  if (enemy) {
    map.points.enemyBarracks = enemy;
  }
}
