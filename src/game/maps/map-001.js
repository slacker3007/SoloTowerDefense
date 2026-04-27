import { GRID_COLS, GRID_ROWS } from "../constants";
import { createElevation, createNullGrid, createStringGrid } from "./elevation";

/** @returns {object} fresh map object (same shape as map001) */
export function createFreshMap001() {
  const islandInset = 2;
  const islandMinX = islandInset;
  const islandMinY = islandInset;
  const islandMaxX = GRID_COLS - 1 - islandInset;
  const islandMaxY = GRID_ROWS - 1 - islandInset;
  const centerX = Math.floor(GRID_COLS / 2);
  const homeBarracks = { x: centerX, y: 3 };
  const enemyBarracks = { x: centerX, y: GRID_ROWS - 5 };

  const elevation = createElevation(GRID_ROWS, GRID_COLS, 0);
  const stairs = createElevation(GRID_ROWS, GRID_COLS, 0);
  const buildings = createStringGrid(GRID_ROWS, GRID_COLS, null);
  const tileOverrides = createNullGrid(GRID_ROWS, GRID_COLS);
  const decorations = createNullGrid(GRID_ROWS, GRID_COLS);

  for (let y = islandMinY; y <= islandMaxY; y += 1) {
    for (let x = islandMinX; x <= islandMaxX; x += 1) {
      elevation[y][x] = 1;
    }
  }

  const highGroundMinX = centerX - 2;
  const highGroundMaxX = centerX + 2;
  const highGroundMinY = islandMinY;
  const highGroundMaxY = islandMinY + 3;
  for (let y = highGroundMinY; y <= highGroundMaxY; y += 1) {
    for (let x = highGroundMinX; x <= highGroundMaxX; x += 1) {
      if (elevation[y][x] >= 1) {
        elevation[y][x] = 2;
      }
    }
  }

  for (let y = highGroundMaxY + 1; y <= highGroundMaxY + 3; y += 1) {
    if (elevation[y][centerX] >= 1) {
      stairs[y][centerX] = 1;
    }
  }

  buildings[homeBarracks.y][homeBarracks.x] = "barracks_blue";
  buildings[enemyBarracks.y][enemyBarracks.x] = "barracks_red";

  return {
    id: "map-001",
    width: GRID_COLS,
    height: GRID_ROWS,
    bgColor: 0x2d4f7d,
    points: {
      homeBarracks,
      enemyBarracks,
    },
    elevation,
    stairs,
    buildings,
    tilesets: {
      shore: "default",
      plateau: "rocks",
    },
    tileOverrides,
    decorations,
  };
}

export const map001 = createFreshMap001();
