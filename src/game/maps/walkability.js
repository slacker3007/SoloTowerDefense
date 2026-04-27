/** Tile override sheet key used for painted roads (path preference). */
export const ROAD_TERRAIN_SHEET = "terrainColor6";

/** Manhattan distance from spawn/goal within which plateau/rim rules relax (must match road relax). */
export const ENEMY_BARRACKS_RELAX_MANHATTAN = 3;

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 */
function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * Grass cell (elevation 1) cardinally touching a plateau cell (elevation >= 2).
 * Visually reads as cliff/rock rim; keep off path unless near barracks (same Manhattan relax as road).
 * @param {*} map
 * @param {number} cellX
 * @param {number} cellY
 */
function isPlateauRimCell(map, cellX, cellY) {
  if (map.elevation[cellY][cellX] !== 1) {
    return false;
  }
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = cellX + dx;
    const ny = cellY + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
      continue;
    }
    if (map.elevation[ny][nx] >= 2) {
      return true;
    }
  }
  return false;
}

/**
 * @param {*} map
 * @param {number} cellX
 * @param {number} cellY
 */
export function isRoadCell(map, cellX, cellY) {
  const o = map.tileOverrides?.[cellY]?.[cellX];
  return o != null && typeof o === "object" && o.sheet === ROAD_TERRAIN_SHEET;
}

/**
 * Shared walkability rules for enemy pathfinding and debug path overlay.
 * @param {*} map
 * @param {*} scene Phaser scene (for towerSystem.cellOccupancy)
 * @param {number} cellX
 * @param {number} cellY
 * @param {{ x: number, y: number }} spawnCell
 * @param {{ x: number, y: number }} targetCell
 */
export function isEnemyWalkableCell(map, scene, cellX, cellY, spawnCell, targetCell) {
  const row = map.elevation[cellY];
  if (!row || row[cellX] == null || row[cellX] < 1) {
    return false;
  }

  const isSpawn = cellX === spawnCell.x && cellY === spawnCell.y;
  const isGoal = cellX === targetCell.x && cellY === targetCell.y;
  const nearSpawnRing = manhattan(cellX, cellY, spawnCell.x, spawnCell.y) <= ENEMY_BARRACKS_RELAX_MANHATTAN;
  const nearGoalRing = manhattan(cellX, cellY, targetCell.x, targetCell.y) <= ENEMY_BARRACKS_RELAX_MANHATTAN;
  const nearBarracksRing = nearSpawnRing || nearGoalRing;

  /** Plateau tops (elevation >= 2): blocked except spawn/goal and same relax ring as road logic (approach tiles). */
  if (!isSpawn && !isGoal && row[cellX] >= 2 && !nearBarracksRing) {
    return false;
  }

  /** Grass cells touching plateau — cliff rim; blocked except near barracks rings. */
  if (!isSpawn && !isGoal && isPlateauRimCell(map, cellX, cellY) && !nearBarracksRing) {
    return false;
  }

  if (!isSpawn && !isGoal && map.buildings[cellY]?.[cellX] != null) {
    return false;
  }

  const towerKey = `${cellX},${cellY}`;
  const towerCells = scene.towerSystem?.cellOccupancy;
  if (!isSpawn && !isGoal && towerCells instanceof Set && towerCells.has(towerKey)) {
    return false;
  }

  return true;
}

/**
 * Walkable only on road tiles (terrainColor6 override) plus spawn/goal barracks cells.
 * Use with `isEnemyWalkableCell` as fallback for grass detours when the road is blocked.
 * @param {*} map
 * @param {*} scene
 * @param {number} cellX
 * @param {number} cellY
 * @param {{ x: number, y: number }} spawnCell
 * @param {{ x: number, y: number }} targetCell
 */
export function isEnemyRoadWalkableCell(map, scene, cellX, cellY, spawnCell, targetCell) {
  if (!isEnemyWalkableCell(map, scene, cellX, cellY, spawnCell, targetCell)) {
    return false;
  }
  const isSpawn = cellX === spawnCell.x && cellY === spawnCell.y;
  const isGoal = cellX === targetCell.x && cellY === targetCell.y;
  if (isSpawn || isGoal) {
    return true;
  }
  const spawnDistance = Math.abs(cellX - spawnCell.x) + Math.abs(cellY - spawnCell.y);
  const targetDistance = Math.abs(cellX - targetCell.x) + Math.abs(cellY - targetCell.y);
  if (spawnDistance <= ENEMY_BARRACKS_RELAX_MANHATTAN || targetDistance <= ENEMY_BARRACKS_RELAX_MANHATTAN) {
    return true;
  }
  return isRoadCell(map, cellX, cellY);
}
