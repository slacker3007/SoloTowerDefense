import { TILE_SIZE } from "../constants";

export function cellToWorld(cellX, cellY) {
  return {
    x: cellX * TILE_SIZE + TILE_SIZE / 2,
    y: cellY * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function worldToCell(worldX, worldY) {
  return {
    x: Math.floor(worldX / TILE_SIZE),
    y: Math.floor(worldY / TILE_SIZE),
  };
}

export function isInsideGrid(cellX, cellY, width, height) {
  return cellX >= 0 && cellY >= 0 && cellX < width && cellY < height;
}

/**
 * Buildable if on land (elevation >= 1) and no building occupies the cell.
 * @param {{ width: number, height: number, elevation: number[][], buildings: (string|null)[][] }} map
 */
export function isBuildable(map, cellX, cellY) {
  if (!isInsideGrid(cellX, cellY, map.width, map.height)) {
    return false;
  }

  if (map.elevation[cellY][cellX] < 1) {
    return false;
  }

  if (map.buildings[cellY][cellX] != null) {
    return false;
  }

  return true;
}

export function getNeighborMask(layer, cellX, cellY, width, height) {
  const north = cellY > 0 && layer[cellY - 1][cellX] === 1 ? 1 : 0;
  const east = cellX < width - 1 && layer[cellY][cellX + 1] === 1 ? 1 : 0;
  const south = cellY < height - 1 && layer[cellY + 1][cellX] === 1 ? 1 : 0;
  const west = cellX > 0 && layer[cellY][cellX - 1] === 1 ? 1 : 0;
  return north | (east << 1) | (south << 2) | (west << 3);
}

/**
 * Preset tile maps for TinySwords/Terrain/Tileset/Tilemap_color1.png (9 cols × 6 rows, 64px tiles).
 * Frame index = row * 9 + col. Bitmask N=1, E=2, S=4, W=8 for neighbors in the same layer.
 * @type {Record<string, Record<string, { byMask: Record<number, number>, fallback: number }>>}
 */
export const TILESET_PRESETS = {
  shore: {
    default: {
      // Left half of sheet — grass / water shoreline
      byMask: {
        6: 0,
        12: 2,
        9: 20,
        3: 18,
        14: 1,
        13: 11,
        11: 19,
        7: 9,
        15: 10,
      },
      fallback: 10,
    },
  },
  plateau: {
    rocks: {
      // Right half — grass on rock cliffs (tune indices if a tile looks off)
      byMask: {
        6: 5,
        12: 7,
        9: 25,
        3: 23,
        14: 6,
        13: 16,
        11: 24,
        7: 14,
        15: 15,
      },
      fallback: 15,
    },
    mirrorShore: {
      byMask: {
        6: 0,
        12: 2,
        9: 20,
        3: 18,
        14: 1,
        13: 11,
        11: 19,
        7: 9,
        15: 10,
      },
      fallback: 10,
    },
  },
};

const DEFAULT_SHORE_PRESET = "default";
const DEFAULT_PLATEAU_PRESET = "rocks";

/**
 * @param {"shore" | "plateau"} layer
 * @param {string} key
 */
export function resolveTilesetPresetKey(layer, key) {
  const bucket = TILESET_PRESETS[layer];
  if (bucket && typeof key === "string" && bucket[key]) {
    return key;
  }
  return layer === "shore" ? DEFAULT_SHORE_PRESET : DEFAULT_PLATEAU_PRESET;
}

/**
 * @param {number} frameIndex
 * @param {number} [cols]
 */
export function frameIndexToSheetPixels(frameIndex, cols = 9) {
  const row = Math.floor(frameIndex / cols);
  const col = frameIndex % cols;
  return { sx: col * TILE_SIZE, sy: row * TILE_SIZE };
}

/**
 * Shore / grass autotile frame for island cells (elevation >= 1 in source map).
 * @param {number[][]} islandMask 0/1 land mask
 * @param {string} [presetKey]
 */
export function getShoreFrameIndex(islandMask, cellX, cellY, width, height, presetKey = DEFAULT_SHORE_PRESET) {
  if (islandMask[cellY][cellX] !== 1) {
    return null;
  }

  const pk = resolveTilesetPresetKey("shore", presetKey);
  const preset = TILESET_PRESETS.shore[pk];
  const mask = getNeighborMask(islandMask, cellX, cellY, width, height);
  return preset.byMask[mask] ?? preset.fallback;
}

/** @deprecated Use getShoreFrameIndex */
export function getTerrainFrameIndex(islandMask, cellX, cellY, width, height, presetKey = DEFAULT_SHORE_PRESET) {
  return getShoreFrameIndex(islandMask, cellX, cellY, width, height, presetKey);
}

/**
 * Plateau / cliff overlay frame for high-ground cells.
 * @param {number[][]} highGround 0/1 plateau mask
 * @param {string} [presetKey]
 */
export function getHighGroundFrameIndex(highGround, cellX, cellY, width, height, presetKey = DEFAULT_PLATEAU_PRESET) {
  if (highGround[cellY][cellX] !== 1) {
    return null;
  }

  const pk = resolveTilesetPresetKey("plateau", presetKey);
  const preset = TILESET_PRESETS.plateau[pk];
  const mask = getNeighborMask(highGround, cellX, cellY, width, height);
  return preset.byMask[mask] ?? preset.fallback;
}
