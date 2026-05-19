import { createElevation, createNullGrid } from "./elevation";
import {
  cloneLayerTile,
  cloneTerrainTileOverride,
  MAP_TILE_LAYER_COUNT,
  normalizeLayerTile,
  normalizeTerrainTileOverride,
} from "./tileOverrideSchema";
import { cloneAssetPlacement, normalizeAssetPlacement } from "./placementSchema";

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
 * @param {*} map
 */
export function ensureMapPlacementGrids(map) {
  ensureMapOverrideGrids(map);
  if (!map.unitPlacements || !Array.isArray(map.unitPlacements) || map.unitPlacements.length !== map.height) {
    map.unitPlacements = createNullGrid(map.height, map.width);
  }
  if (!map.uiPlacements || !Array.isArray(map.uiPlacements) || map.uiPlacements.length !== map.height) {
    map.uiPlacements = createNullGrid(map.height, map.width);
  }
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      map.unitPlacements[y][x] = normalizeAssetPlacement(map.unitPlacements[y][x]);
      map.uiPlacements[y][x] = normalizeAssetPlacement(map.uiPlacements[y][x]);
    }
  }
}

/**
 * @param {number} rows
 * @param {number} cols
 */
export function createLayerTileGrids(rows, cols) {
  return Array.from({ length: MAP_TILE_LAYER_COUNT }, () => createNullGrid(rows, cols));
}

/**
 * @param {*} map
 * @param {number} x
 * @param {number} y
 */
export function recomputeCellElevationFromLayerTiles(map, x, y) {
  let topLayer = 0;
  for (let layer = 1; layer < MAP_TILE_LAYER_COUNT; layer += 1) {
    if (map.layerTiles?.[layer]?.[y]?.[x] != null) {
      topLayer = layer;
    }
  }
  map.elevation[y][x] = topLayer;
  if (topLayer === 0) {
    map.stairs[y][x] = 0;
  }
}

/**
 * Ensure the four numbered editor tile layers exist. Legacy tile overrides migrate
 * into the elevation layer they were painted on; decorations become layer 3 tiles.
 * @param {*} map
 */
export function ensureMapLayerTiles(map) {
  ensureMapOverrideGrids(map);

  const existing = Array.isArray(map.layerTiles) ? map.layerTiles : null;
  const valid =
    existing != null &&
    existing.length === MAP_TILE_LAYER_COUNT &&
    existing.every(
      (grid) =>
        Array.isArray(grid) &&
        grid.length === map.height &&
        grid.every((row) => Array.isArray(row) && row.length === map.width),
    );

  if (!valid) {
    const next = createLayerTileGrids(map.height, map.width);
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const elev = Math.max(0, Math.min(MAP_TILE_LAYER_COUNT - 1, Math.floor(map.elevation?.[y]?.[x] ?? 0)));
        const tile = normalizeLayerTile(map.tileOverrides?.[y]?.[x]);
        if (tile != null) {
          next[elev][y][x] = tile;
        }

        const dec = normalizeLayerTile(map.decorations?.[y]?.[x]);
        if (dec != null) {
          next[MAP_TILE_LAYER_COUNT - 1][y][x] = dec;
          map.elevation[y][x] = MAP_TILE_LAYER_COUNT - 1;
        }
      }
    }
    map.layerTiles = next;
  } else {
    for (let layer = 0; layer < MAP_TILE_LAYER_COUNT; layer += 1) {
      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          map.layerTiles[layer][y][x] = normalizeLayerTile(map.layerTiles[layer][y][x]);
        }
      }
    }
  }

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const ev = map.elevation?.[y]?.[x];
      map.elevation[y][x] = Number.isFinite(ev) ? Math.max(0, Math.min(MAP_TILE_LAYER_COUNT - 1, Math.floor(ev))) : 0;
      if (valid) {
        recomputeCellElevationFromLayerTiles(map, x, y);
      }
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
  ensureMapLayerTiles(source);
  ensureMapPlacementGrids(source);
  ensureMapOverrideGrids(target);
  ensureMapLayerTiles(target);
  ensureMapPlacementGrids(target);
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
      target.unitPlacements[y][x] = cloneAssetPlacement(normalizeAssetPlacement(source.unitPlacements?.[y]?.[x]));
      target.uiPlacements[y][x] = cloneAssetPlacement(normalizeAssetPlacement(source.uiPlacements?.[y]?.[x]));
      for (let layer = 0; layer < MAP_TILE_LAYER_COUNT; layer += 1) {
        target.layerTiles[layer][y][x] = cloneLayerTile(normalizeLayerTile(source.layerTiles[layer][y][x]));
      }
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
