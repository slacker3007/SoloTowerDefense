import Phaser from "phaser";
import { TILE_SIZE } from "../constants";
import { hasTinySwordsFolderHint, SHEEP_IDLE_ANIM_KEY, SHEEP_IDLE_SHEET_KEY } from "../assets";
import { createElevation, createNullGrid, createStringGrid } from "./elevation";
import { cellToWorld } from "./tileRules";
import { ensureMapLayerTiles, ensureMapOverrideGrids, ensureMapTilesets, ensurePathMaskGrid } from "./mapUtils";
import { addBuildingToContainer } from "../buildings/buildingCatalog";
import {
  DECORATION_IMAGE_KEYS,
  DEFAULT_TERRAIN_SHEET,
  MAP_TILE_LAYER_COUNT,
} from "./tileOverrideSchema";

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {{ sheet: string, frame: number } | null} tile
 * @param {number} cellX
 * @param {number} cellY
 * @param {number} depth
 */
function addLayerTileSprite(scene, container, tile, cellX, cellY, depth) {
  if (tile == null || typeof tile.sheet !== "string" || typeof tile.frame !== "number") {
    return;
  }
  if (!scene.textures.exists(tile.sheet)) {
    return;
  }
  const px = cellX * TILE_SIZE;
  const py = cellY * TILE_SIZE;
  if (tile.sheet === SHEEP_IDLE_SHEET_KEY) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, tile.sheet, 0);
    spr.setDisplaySize(64, 64);
    spr.setDepth(depth);
    if (scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
      spr.play(SHEEP_IDLE_ANIM_KEY, false, Phaser.Math.Clamp(Math.floor(tile.frame), 0, 5));
    }
    container.add(spr);
    return;
  }
  if (DECORATION_IMAGE_KEYS.includes(tile.sheet)) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, tile.sheet);
    spr.setOrigin(0.5, 1);
    spr.setDisplaySize(128, 192);
    spr.setDepth(depth);
    container.add(spr);
    return;
  }
  const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, tile.sheet, tile.frame);
  spr.setDepth(depth);
  container.add(spr);
}

/**
 * @param {number} gridW
 * @param {number} gridH
 * @param {Phaser.Math.RandomDataGenerator} rng
 * @returns {{
 *   map: object,
 *   buildingCell: { x: number, y: number },
 *   warriorCell: { x: number, y: number } | null,
 *   archerCell: { x: number, y: number } | null,
 * }}
 */
export function buildMenuIslandMap(gridW, gridH, rng) {
  const elevation = createElevation(gridH, gridW, 0);
  const numSeeds = rng.integerInRange(3, 4);
  /** @type {{ cx: number, cy: number, r: number }[]} */
  const seeds = [];
  for (let i = 0; i < numSeeds; i += 1) {
    seeds.push({
      cx: rng.realInRange(gridW * 0.12, gridW * 0.88),
      cy: rng.realInRange(gridH * 0.22, gridH * 0.92),
      r: rng.realInRange(Math.min(gridW, gridH) * 0.11, Math.min(gridW, gridH) * 0.24),
    });
  }

  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      let land = false;
      for (const s of seeds) {
        const dx = x + 0.5 - s.cx;
        const dy = y + 0.5 - s.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s.r + rng.realInRange(-0.75, 0.75)) {
          land = true;
          break;
        }
      }
      if (land) {
        elevation[y][x] = 1;
      }
    }
  }

  if (rng.frac() < 0.65) {
    const ax = rng.integerInRange(0, 2);
    const ay = rng.integerInRange(0, 2);
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = ax + dx;
        const y = ay + dy;
        if (x < gridW && y < gridH) {
          elevation[y][x] = 1;
        }
      }
    }
  }

  let landCount = 0;
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (elevation[y][x] >= 1) {
        landCount += 1;
      }
    }
  }
  if (landCount < 12) {
    const my = Math.floor(gridH * 0.72);
    const mx = Math.floor(gridW / 2);
    for (let y = my - 2; y <= my + 2; y += 1) {
      for (let x = mx - 3; x <= mx + 3; x += 1) {
        if (y >= 0 && y < gridH && x >= 0 && x < gridW) {
          elevation[y][x] = 1;
        }
      }
    }
  }

  /** @type {{ x: number, y: number }[]} */
  const footCells = [];
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (elevation[y][x] === 1) {
        footCells.push({ x, y });
      }
    }
  }

  const mainSeed = seeds.reduce((best, s) => (s.cy > best.cy ? s : best), seeds[0]);
  const plateauN = rng.integerInRange(4, 7);
  for (let i = 0; i < plateauN; i += 1) {
    const x = rng.integerInRange(1, gridW - 2);
    const y = rng.integerInRange(1, gridH - 2);
    if (elevation[y][x] !== 1) {
      continue;
    }
    const dx = x + 0.5 - mainSeed.cx;
    const dy = y + 0.5 - mainSeed.cy;
    if (Math.sqrt(dx * dx + dy * dy) < mainSeed.r * 1.15 || rng.frac() < 0.35) {
      elevation[y][x] = 2;
    }
  }

  const buildings = createStringGrid(gridH, gridW, null);
  if (footCells.length === 0) {
    for (let y = 0; y < gridH; y += 1) {
      for (let x = 0; x < gridW; x += 1) {
        if (elevation[y][x] >= 1) {
          footCells.push({ x, y });
        }
      }
    }
  }

  let bx = Math.floor(gridW / 2);
  let by = Math.floor(gridH / 2);
  if (footCells.length > 0) {
    const maxY = Math.max(...footCells.map((c) => c.y));
    const bottomBand = footCells.filter((c) => c.y >= maxY - 2);
    const pool = bottomBand.length > 0 ? bottomBand : footCells;
    const pick = pool[rng.integerInRange(0, pool.length - 1)];
    bx = pick.x;
    by = pick.y;
  }
  buildings[by][bx] = "barracks_blue";

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let i = dirs.length - 1; i > 0; i -= 1) {
    const j = rng.integerInRange(0, i);
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  /** @type {{ x: number, y: number } | null} */
  let warriorCell = null;
  for (const [dx, dy] of dirs) {
    const nx = bx + dx;
    const ny = by + dy;
    if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && elevation[ny][nx] >= 1) {
      warriorCell = { x: nx, y: ny };
      break;
    }
  }
  if (warriorCell == null && footCells.length > 0) {
    const alt = footCells.find((c) => c.x !== bx || c.y !== by);
    if (alt) {
      warriorCell = { x: alt.x, y: alt.y };
    }
  }

  /** @type {{ x: number, y: number } | null} */
  let archerCell = null;
  const occupied = new Set([`${bx},${by}`, warriorCell ? `${warriorCell.x},${warriorCell.y}` : ""]);
  const candidates = [];
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (elevation[y][x] < 1) {
        continue;
      }
      const k = `${x},${y}`;
      if (occupied.has(k)) {
        continue;
      }
      if (warriorCell) {
        const dist = Math.abs(x - warriorCell.x) + Math.abs(y - warriorCell.y);
        if (dist < 2) {
          continue;
        }
      }
      candidates.push({ x, y });
    }
  }
  if (candidates.length > 0) {
    archerCell = candidates[rng.integerInRange(0, candidates.length - 1)];
  }

  const map = {
    id: "menu-backdrop",
    width: gridW,
    height: gridH,
    bgColor: 0x2d4f7d,
    points: {
      homeBarracks: { x: bx, y: by },
      enemyBarracks: { x: Math.max(0, bx - 1), y: Math.max(0, by - 1) },
    },
    elevation,
    stairs: createElevation(gridH, gridW, 0),
    buildings,
    tileOverrides: createNullGrid(gridH, gridW),
    decorations: createNullGrid(gridH, gridW),
    tilesets: { shore: "default", plateau: "rocks" },
    pathMask: createElevation(gridH, gridW, 0),
  };

  ensureMapTilesets(map);
  ensureMapOverrideGrids(map);
  ensureMapLayerTiles(map);
  ensurePathMaskGrid(map);

  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      const elev = elevation[y][x];
      if (elev >= 1) {
        map.layerTiles[1][y][x] = { sheet: DEFAULT_TERRAIN_SHEET, frame: 10 };
      }
      if (elev >= 2) {
        map.layerTiles[2][y][x] = { sheet: DEFAULT_TERRAIN_SHEET, frame: 15 };
      }
    }
  }

  const decoOccupied = new Set([`${bx},${by}`]);
  if (warriorCell) {
    decoOccupied.add(`${warriorCell.x},${warriorCell.y}`);
  }
  if (archerCell) {
    decoOccupied.add(`${archerCell.x},${archerCell.y}`);
  }

  const sheepFoot = footCells.filter((c) => !decoOccupied.has(`${c.x},${c.y}`));
  const sheepCount = Math.min(rng.integerInRange(1, 2), sheepFoot.length);
  for (let s = 0; s < sheepCount; s += 1) {
    const idx = rng.integerInRange(0, sheepFoot.length - 1);
    const cell = sheepFoot.splice(idx, 1)[0];
    if (cell) {
      map.decorations[cell.y][cell.x] = { sheet: SHEEP_IDLE_SHEET_KEY, frame: rng.integerInRange(0, 5) };
      map.layerTiles[3][cell.y][cell.x] = map.decorations[cell.y][cell.x];
      map.elevation[cell.y][cell.x] = 3;
      decoOccupied.add(`${cell.x},${cell.y}`);
    }
  }

  /** @type {{ x: number, y: number }[]} */
  const plateauCells = [];
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (elevation[y][x] === 2 && !decoOccupied.has(`${x},${y}`)) {
        plateauCells.push({ x, y });
      }
    }
  }
  let towerPlaced = 0;
  const towerGoal = rng.integerInRange(1, 2);
  while (towerPlaced < towerGoal && plateauCells.length > 0) {
    const ti = rng.integerInRange(0, plateauCells.length - 1);
    const t = plateauCells.splice(ti, 1)[0];
    if (t) {
      map.decorations[t.y][t.x] = { sheet: "blueTower", frame: 0 };
      map.layerTiles[3][t.y][t.x] = map.decorations[t.y][t.x];
      map.elevation[t.y][t.x] = 3;
      decoOccupied.add(`${t.x},${t.y}`);
      towerPlaced += 1;
    }
  }
  if (towerPlaced === 0) {
    const spare = footCells.filter((c) => !decoOccupied.has(`${c.x},${c.y}`) && (c.x !== bx || c.y !== by));
    if (spare.length > 0) {
      const t = spare[rng.integerInRange(0, spare.length - 1)];
      map.decorations[t.y][t.x] = { sheet: "blueTower", frame: 0 };
      map.layerTiles[3][t.y][t.x] = map.decorations[t.y][t.x];
      map.elevation[t.y][t.x] = 3;
    }
  }

  return { map, buildingCell: { x: bx, y: by }, warriorCell, archerCell };
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {object} map
 */
export function renderMenuTerrainBackdrop(scene, container, map) {
  const hasSheet = hasTinySwordsFolderHint(scene);
  ensureMapTilesets(map);
  ensureMapOverrideGrids(map);
  ensureMapLayerTiles(map);
  ensurePathMaskGrid(map);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const elev = Math.max(0, Math.min(MAP_TILE_LAYER_COUNT - 1, Math.floor(map.elevation[y][x] ?? 0)));
      if (!hasSheet) {
        if (elev >= 1) {
          const colors = [0x2d4f7d, 0x7fa05f, 0x8fb665, 0x9fc875];
          const fallback = scene.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, colors[elev] ?? colors[1]);
          fallback.setOrigin(0.5, 0.5);
          container.add(fallback);
        }
        continue;
      }

      for (let layer = 0; layer <= elev; layer += 1) {
        const tile = map.layerTiles?.[layer]?.[y]?.[x] ?? null;
        addLayerTileSprite(scene, container, tile, x, y, layer === 3 ? 12 : layer);
      }
    }
  }

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const key = map.buildings[y][x];
      if (key == null) {
        continue;
      }
      const pos = cellToWorld(x, y);
      addBuildingToContainer(scene, container, key, pos.x, pos.y);
    }
  }
}

/**
 * @param {{ x: number, y: number } | null} cell
 * @returns {{ x: number, y: number } | null}
 */
export function cellCenterLocal(cell) {
  if (cell == null) {
    return null;
  }
  return cellToWorld(cell.x, cell.y);
}
