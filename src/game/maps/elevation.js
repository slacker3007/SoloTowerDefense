/**
 * Elevation grid: 0 = water, 1 = grass / island, 2 = high ground plateau.
 * Visual masks are derived for autotiling and foam.
 */

/** @param {number} rows @param {number} cols @param {number} fill */
export function createElevation(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

/** @param {number} rows @param {number} cols @param {string|null} fill */
export function createStringGrid(rows, cols, fill = null) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

/** 2D grid filled with `null` (for per-cell overrides / decorations). */
export function createNullGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

/**
 * @param {number[][]} elevation
 * @returns {{
 *   islandMask: number[][],
 *   highGround: number[][],
 *   groundEdges: number[][],
 *   highGroundEdges: number[][],
 *   waterFoam: number[][]
 * }}
 */
export function deriveLayers(elevation) {
  const rows = elevation.length;
  const cols = elevation[0]?.length ?? 0;

  const islandMask = createElevation(rows, cols, 0);
  const highGround = createElevation(rows, cols, 0);
  const groundEdges = createElevation(rows, cols, 0);
  const highGroundEdges = createElevation(rows, cols, 0);
  const waterFoam = createElevation(rows, cols, 0);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const elev = elevation[y][x];
      if (elev >= 1) {
        islandMask[y][x] = 1;
      }
      if (elev >= 2) {
        highGround[y][x] = 1;
      }
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (islandMask[y][x] !== 1) {
        continue;
      }
      const north = y > 0 ? elevation[y - 1][x] < 1 : true;
      const east = x < cols - 1 ? elevation[y][x + 1] < 1 : true;
      const south = y < rows - 1 ? elevation[y + 1][x] < 1 : true;
      const west = x > 0 ? elevation[y][x - 1] < 1 : true;
      if (north || east || south || west) {
        groundEdges[y][x] = 1;
      }
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (highGround[y][x] !== 1) {
        continue;
      }
      const north = y > 0 ? highGround[y - 1][x] !== 1 : true;
      const east = x < cols - 1 ? highGround[y][x + 1] !== 1 : true;
      const south = y < rows - 1 ? highGround[y + 1][x] !== 1 : true;
      const west = x > 0 ? highGround[y][x - 1] !== 1 : true;
      if (north || east || south || west) {
        highGroundEdges[y][x] = 1;
      }
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (islandMask[y][x] === 1) {
        continue;
      }
      const north = y > 0 ? islandMask[y - 1][x] === 1 : false;
      const east = x < cols - 1 ? islandMask[y][x + 1] === 1 : false;
      const south = y < rows - 1 ? islandMask[y + 1][x] === 1 : false;
      const west = x > 0 ? islandMask[y][x - 1] === 1 : false;
      if (north || east || south || west) {
        waterFoam[y][x] = 1;
      }
    }
  }

  return { islandMask, highGround, groundEdges, highGroundEdges, waterFoam };
}
