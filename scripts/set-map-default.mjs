/**
 * Validates an editor-exported map JSON and writes it to the shipped default:
 * src/game/maps/data/map-001.default.json
 *
 * Usage: node scripts/set-map-default.mjs <path-to-export.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLayerTile, normalizeTerrainTileOverride } from "../src/game/maps/tileOverrideSchema.js";

/** Keep in sync with src/game/constants.js (avoid importing constants.js — it pulls balance). */
const GRID_COLS = 20;
const GRID_ROWS = 25;
const MAP_TILE_LAYER_COUNT = 4;

const MAP_JSON_VERSION = 1;

/** Same rules as tryParsePathMaskFromJson in src/game/maps/enemyPath.js (inlined for Node ESM). */
function tryParsePathMaskFromJson(raw, width, height) {
  if (!Array.isArray(raw) || raw.length !== height) {
    return null;
  }
  const m = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
  for (let y = 0; y < height; y += 1) {
    const row = /** @type {unknown[]} */ (raw[y]);
    if (!Array.isArray(row) || row.length !== width) {
      return null;
    }
    for (let x = 0; x < width; x += 1) {
      const v = row[x];
      if (v === 0 || v === 1) {
        m[y][x] = v;
      } else {
        return null;
      }
    }
  }
  return m;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEST = join(__dirname, "..", "src", "game", "maps", "data", "map-001.default.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>}
 */
function validateAndBuildOutput(data) {
  if (!data || typeof data !== "object") {
    fail("Map data must be a JSON object.");
  }
  const d = /** @type {Record<string, unknown>} */ (data);

  if (d.version !== MAP_JSON_VERSION) {
    fail(`Expected version ${MAP_JSON_VERSION}, got ${String(d.version)}.`);
  }
  if (d.width !== GRID_COLS || d.height !== GRID_ROWS) {
    fail(`Expected width=${GRID_COLS} height=${GRID_ROWS}, got width=${String(d.width)} height=${String(d.height)}.`);
  }

  const w = GRID_COLS;
  const h = GRID_ROWS;

  if (!Array.isArray(d.elevation) || !Array.isArray(d.stairs) || !Array.isArray(d.buildings)) {
    fail("Missing elevation, stairs, or buildings arrays.");
  }
  if (d.elevation.length !== h || d.stairs.length !== h || d.buildings.length !== h) {
    fail("elevation/stairs/buildings row count must match height.");
  }

  /** @type {number[][]} */
  const elevation = [];
  /** @type {number[][]} */
  const stairs = [];
  /** @type {(string | null)[][]} */
  const buildings = [];

  for (let y = 0; y < h; y += 1) {
    const rowE = d.elevation[y];
    const rowS = d.stairs[y];
    const rowB = d.buildings[y];
    if (!Array.isArray(rowE) || rowE.length !== w) {
      fail(`elevation row ${y} must be an array of length ${w}.`);
    }
    if (!Array.isArray(rowS) || rowS.length !== w) {
      fail(`stairs row ${y} must be an array of length ${w}.`);
    }
    if (!Array.isArray(rowB) || rowB.length !== w) {
      fail(`buildings row ${y} must be an array of length ${w}.`);
    }
    elevation.push([]);
    stairs.push([]);
    buildings.push([]);
    for (let x = 0; x < w; x += 1) {
      const ev = rowE[x];
      const st = rowS[x];
      const bd = rowB[x];
      if (typeof ev !== "number" || ev < 0 || ev >= MAP_TILE_LAYER_COUNT || !Number.isFinite(ev)) {
        fail(`Invalid elevation at (${x},${y}): ${String(ev)} (expected 0..${MAP_TILE_LAYER_COUNT - 1})`);
      }
      if (st !== 0 && st !== 1) {
        fail(`Invalid stairs at (${x},${y}): expected 0 or 1, got ${String(st)}`);
      }
      elevation[y].push(ev);
      stairs[y].push(st === 1 ? 1 : 0);
      buildings[y].push(typeof bd === "string" ? bd : null);
    }
  }

  const id = typeof d.id === "string" ? d.id : "map-001";
  const bgColor = typeof d.bgColor === "number" && Number.isFinite(d.bgColor) ? d.bgColor : 0x2d4f7d;

  /** @type {{ homeBarracks: { x: number, y: number }, enemyBarracks: { x: number, y: number } }} */
  const points = {
    homeBarracks: { x: Math.floor(w / 2), y: 3 },
    enemyBarracks: { x: Math.floor(w / 2), y: h - 5 },
  };
  const pts = d.points;
  if (pts && typeof pts === "object") {
    const p = /** @type {Record<string, unknown>} */ (pts);
    if (p.homeBarracks && typeof p.homeBarracks === "object") {
      const h0 = /** @type {{ x?: unknown, y?: unknown }} */ (p.homeBarracks);
      if (typeof h0.x === "number" && typeof h0.y === "number") {
        points.homeBarracks = { x: h0.x, y: h0.y };
      }
    }
    if (p.enemyBarracks && typeof p.enemyBarracks === "object") {
      const e0 = /** @type {{ x?: unknown, y?: unknown }} */ (p.enemyBarracks);
      if (typeof e0.x === "number" && typeof e0.y === "number") {
        points.enemyBarracks = { x: e0.x, y: e0.y };
      }
    }
  }

  for (const label of ["homeBarracks", "enemyBarracks"]) {
    const pt = points[/** @type {"homeBarracks" | "enemyBarracks"} */ (label)];
    if (pt.x < 0 || pt.x >= w || pt.y < 0 || pt.y >= h) {
      fail(`points.${label} out of bounds: (${pt.x},${pt.y}) for ${w}x${h}`);
    }
  }

  let shore = "default";
  let plateau = "rocks";
  const ts = d.tilesets;
  if (ts && typeof ts === "object") {
    const t = /** @type {Record<string, unknown>} */ (ts);
    if (typeof t.shore === "string") {
      shore = t.shore;
    }
    if (typeof t.plateau === "string") {
      plateau = t.plateau;
    }
  }

  /** @type {({ sheet: string, frame: number } | null)[][]} */
  const tileOverrides = [];
  const rowTO = d.tileOverrides;
  if (Array.isArray(rowTO) && rowTO.length === h) {
    for (let y = 0; y < h; y += 1) {
      const row = rowTO[y];
      if (!Array.isArray(row) || row.length !== w) {
        fail(`tileOverrides row ${y} must be an array of length ${w}.`);
      }
      tileOverrides.push([]);
      for (let x = 0; x < w; x += 1) {
        const v = row[x];
        if (v != null && normalizeTerrainTileOverride(v) === null) {
          fail(`Invalid tileOverrides at (${x},${y}).`);
        }
        tileOverrides[y].push(normalizeTerrainTileOverride(v));
      }
    }
  } else if (rowTO != null) {
    fail("tileOverrides must be a 2D array matching map height or be omitted.");
  } else {
    for (let y = 0; y < h; y += 1) {
      tileOverrides.push(Array.from({ length: w }, () => /** @type {const} */ (null)));
    }
  }

  /** @type {({ sheet: string, frame: number } | null)[][]} */
  const decorations = [];
  const rowDec = d.decorations;
  if (Array.isArray(rowDec) && rowDec.length === h) {
    for (let y = 0; y < h; y += 1) {
      const row = rowDec[y];
      if (!Array.isArray(row) || row.length !== w) {
        fail(`decorations row ${y} must be an array of length ${w}.`);
      }
      decorations.push([]);
      for (let x = 0; x < w; x += 1) {
        const v = row[x];
        if (v == null) {
          decorations[y].push(null);
        } else if (typeof v === "object" && typeof v.sheet === "string" && typeof v.frame === "number" && Number.isFinite(v.frame)) {
          decorations[y].push({ sheet: v.sheet, frame: v.frame });
        } else {
          fail(`Invalid decorations at (${x},${y}).`);
        }
      }
    }
  } else if (rowDec != null) {
    fail("decorations must be a 2D array matching map height or be omitted.");
  } else {
    for (let y = 0; y < h; y += 1) {
      decorations.push(Array.from({ length: w }, () => /** @type {const} */ (null)));
    }
  }

  const pm = tryParsePathMaskFromJson(d.pathMask, w, h);
  if (!pm) {
    fail("pathMask is missing or invalid (must be height x width grid of 0 and 1).");
  }
  const pathMask = pm.map((row) => [...row]);

  /** @type {({ sheet: string, frame: number } | null)[][][] | undefined} */
  let layerTiles;
  if (Array.isArray(d.layerTiles) && d.layerTiles.length === MAP_TILE_LAYER_COUNT) {
    layerTiles = [];
    for (let layer = 0; layer < MAP_TILE_LAYER_COUNT; layer += 1) {
      const grid = d.layerTiles[layer];
      if (!Array.isArray(grid) || grid.length !== h) {
        fail(`layerTiles[${layer}] must be a 2D array with height ${h}.`);
      }
      layerTiles.push([]);
      for (let y = 0; y < h; y += 1) {
        const row = grid[y];
        if (!Array.isArray(row) || row.length !== w) {
          fail(`layerTiles[${layer}][${y}] must be an array of length ${w}.`);
        }
        layerTiles[layer].push([]);
        for (let x = 0; x < w; x += 1) {
          const v = row[x];
          const tile = normalizeLayerTile(v);
          if (v != null && tile === null) {
            fail(`Invalid layerTiles[${layer}][${y}][${x}].`);
          }
          layerTiles[layer][y].push(tile);
        }
      }
    }
  }

  const out = {
    id,
    version: MAP_JSON_VERSION,
    width: w,
    height: h,
    bgColor,
    points,
    tilesets: { shore, plateau },
    elevation,
    stairs,
    buildings,
    tileOverrides,
    decorations,
    pathMask,
  };
  if (layerTiles) {
    out.layerTiles = layerTiles;
  }
  return out;
}

const inputPath = process.argv[2];
if (!inputPath) {
  fail("Usage: node scripts/set-map-default.mjs <path-to-export.json>");
}

let raw;
try {
  raw = readFileSync(inputPath, "utf8");
} catch (err) {
  fail(`Cannot read file: ${inputPath}\n${/** @type {Error} */ (err).message}`);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  fail(`Invalid JSON: ${/** @type {Error} */ (err).message}`);
}

const root = parsed && typeof parsed === "object" ? /** @type {Record<string, unknown>} */ (parsed) : null;
const mapData =
  root?.map && typeof root.map === "object" ? /** @type {Record<string, unknown>} */ (root.map) : root;

const out = validateAndBuildOutput(mapData);
writeFileSync(DEST, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Wrote ${DEST}`);
