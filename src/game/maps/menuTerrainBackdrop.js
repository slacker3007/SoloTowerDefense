import Phaser from "phaser";
import { TILE_SIZE } from "../constants";
import { hasTinySwordsFolderHint, SHEEP_IDLE_ANIM_KEY, SHEEP_IDLE_SHEET_KEY } from "../assets";
import { createElevation, createNullGrid, createStringGrid, deriveLayers } from "./elevation";
import { cellToWorld, getHighGroundFrameIndex, getShoreFrameIndex } from "./tileRules";
import { ensureMapOverrideGrids, ensureMapTilesets, ensurePathMaskGrid } from "./mapUtils";
import {
  DECORATION_IMAGE_KEYS,
  DEFAULT_TERRAIN_SHEET,
  normalizeTerrainTileOverride,
} from "./tileOverrideSchema";

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
  ensurePathMaskGrid(map);

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
      decoOccupied.add(`${t.x},${t.y}`);
      towerPlaced += 1;
    }
  }
  if (towerPlaced === 0) {
    const spare = footCells.filter((c) => !decoOccupied.has(`${c.x},${c.y}`) && (c.x !== bx || c.y !== by));
    if (spare.length > 0) {
      const t = spare[rng.integerInRange(0, spare.length - 1)];
      map.decorations[t.y][t.x] = { sheet: "blueTower", frame: 0 };
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
  const layers = deriveLayers(map.elevation);
  const hasSheet = hasTinySwordsFolderHint(scene);
  ensureMapTilesets(map);
  ensureMapOverrideGrids(map);
  ensurePathMaskGrid(map);
  const shoreKey = map.tilesets.shore;
  const plateauKey = map.tilesets.plateau;

  if (hasSheet && scene.textures.exists("waterFoamSheet")) {
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        if (layers.waterFoam[y][x] !== 1) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const foam = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, "waterFoamSheet", 0);
        foam.setAlpha(0.82);
        container.add(foam);
      }
    }
  }

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (layers.islandMask[y][x] !== 1) {
        continue;
      }
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      if (hasSheet) {
        const elev = map.elevation[y][x];
        const ov = normalizeTerrainTileOverride(map.tileOverrides[y][x]);
        const frame =
          elev < 2 && ov != null
            ? ov.frame
            : getShoreFrameIndex(layers.islandMask, x, y, map.width, map.height, shoreKey);
        const sheetKey = elev < 2 && ov != null && scene.textures.exists(ov.sheet) ? ov.sheet : DEFAULT_TERRAIN_SHEET;
        const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, sheetKey, frame ?? 0);
        container.add(spr);
      } else {
        const fallback = scene.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 0x7fa05f);
        fallback.setOrigin(0.5, 0.5);
        container.add(fallback);
      }
    }
  }

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (layers.highGround[y][x] !== 1) {
        continue;
      }
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (hasSheet) {
        const elev = map.elevation[y][x];
        const ov = normalizeTerrainTileOverride(map.tileOverrides[y][x]);
        const frame =
          elev === 2 && ov != null
            ? ov.frame
            : getHighGroundFrameIndex(layers.highGround, x, y, map.width, map.height, plateauKey);
        const sheetKey = elev === 2 && ov != null && scene.textures.exists(ov.sheet) ? ov.sheet : DEFAULT_TERRAIN_SHEET;
        const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, sheetKey, frame ?? 0);
        spr.setAlpha(0.98);
        container.add(spr);
      } else {
        const overlay = scene.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE - 8, TILE_SIZE - 8, 0x8fb665, 0.55);
        overlay.setOrigin(0.5, 0.5);
        container.add(overlay);
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
      if (key === "barracks_blue") {
        if (hasSheet && scene.textures.exists("blueBarracks")) {
          container.add(scene.add.image(pos.x, pos.y, "blueBarracks"));
        } else {
          container.add(scene.add.rectangle(pos.x, pos.y, TILE_SIZE - 8, TILE_SIZE - 8, 0x355bb7));
        }
      } else if (key === "barracks_red") {
        if (hasSheet && scene.textures.exists("redBarracks")) {
          container.add(scene.add.image(pos.x, pos.y, "redBarracks"));
        } else {
          container.add(scene.add.rectangle(pos.x, pos.y, TILE_SIZE - 8, TILE_SIZE - 8, 0xb43b3b));
        }
      }
    }
  }

  if (hasSheet) {
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const dec = map.decorations[y][x];
        if (dec == null || typeof dec !== "object" || typeof dec.sheet !== "string" || typeof dec.frame !== "number") {
          continue;
        }
        if (!scene.textures.exists(dec.sheet)) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (dec.sheet === SHEEP_IDLE_SHEET_KEY) {
          const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, dec.sheet, 0);
          spr.setDisplaySize(64, 64);
          spr.setDepth(12);
          if (scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
            spr.play(SHEEP_IDLE_ANIM_KEY, false, Phaser.Math.Clamp(Math.floor(dec.frame), 0, 5));
          }
          container.add(spr);
        } else if (DECORATION_IMAGE_KEYS.includes(dec.sheet)) {
          const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, dec.sheet);
          spr.setOrigin(0.5, 1);
          spr.setDisplaySize(128, 192);
          spr.setDepth(12);
          container.add(spr);
        } else {
          const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, dec.sheet, dec.frame);
          spr.setDepth(12);
          container.add(spr);
        }
      }
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
