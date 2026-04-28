import { GRID_COLS, GRID_ROWS } from "../constants";
import defaultMapJson from "./data/map-001.default.json";
import { buildDefaultPathMask, pathMaskFromLegacyEnemyPath, tryParsePathMaskFromJson } from "./enemyPath";
import { ensureMapOverrideGrids, ensureMapTilesets, ensurePathMaskGrid, syncBarracksPointsFromBuildings } from "./mapUtils";
import { normalizeTerrainTileOverride } from "./tileOverrideSchema";

/** Build a runtime map object from serialized editor/export JSON. */
function mapFromSerialized(data) {
  const d = /** @type {Record<string, unknown>} */ (data);
  const width = typeof d.width === "number" ? d.width : GRID_COLS;
  const height = typeof d.height === "number" ? d.height : GRID_ROWS;
  if (width !== GRID_COLS || height !== GRID_ROWS) {
    console.warn(`map-001.default.json size ${width}x${height} does not match GRID_COLS/GRID_ROWS ${GRID_COLS}x${GRID_ROWS}`);
  }

  const pts = d.points && typeof d.points === "object" ? /** @type {Record<string, { x?: number, y?: number }>} */ (d.points) : {};
  const home = pts.homeBarracks;
  const enemy = pts.enemyBarracks;

  const elevation = Array.isArray(d.elevation) ? /** @type {number[][]} */ (d.elevation) : [];
  const stairs = Array.isArray(d.stairs) ? /** @type {number[][]} */ (d.stairs) : [];
  const buildings = Array.isArray(d.buildings) ? /** @type {(string | null)[][]} */ (d.buildings) : [];
  const tileOv = Array.isArray(d.tileOverrides) ? /** @type {unknown[][]} */ (d.tileOverrides) : [];
  const dec = Array.isArray(d.decorations) ? /** @type {unknown[][]} */ (d.decorations) : [];
  const rawPathMask = d.pathMask;
  const rawEnemyPath = d.enemyPath;

  const map = {
    id: typeof d.id === "string" ? d.id : "map-001",
    width,
    height,
    bgColor: typeof d.bgColor === "number" ? d.bgColor : 0x2d4f7d,
    points: {
      homeBarracks:
        home && typeof home.x === "number" && typeof home.y === "number" ? { x: home.x, y: home.y } : { x: Math.floor(GRID_COLS / 2), y: 3 },
      enemyBarracks:
        enemy && typeof enemy.x === "number" && typeof enemy.y === "number"
          ? { x: enemy.x, y: enemy.y }
          : { x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 5 },
    },
    elevation: elevation.map((row) => [...row]),
    stairs: stairs.map((row) => row.map((v) => (v === 1 ? 1 : 0))),
    buildings: buildings.map((row) => row.map((b) => (typeof b === "string" ? b : null))),
    tileOverrides: tileOv.map((row) => row.map((v) => normalizeTerrainTileOverride(v))),
    decorations: dec.map((row) =>
      row.map((v) => {
        if (v != null && typeof v === "object") {
          const o = /** @type {{ sheet?: unknown, frame?: unknown }} */ (v);
          if (typeof o.sheet === "string" && typeof o.frame === "number" && Number.isFinite(o.frame)) {
            return { sheet: o.sheet, frame: o.frame };
          }
        }
        return null;
      }),
    ),
    tilesets: { shore: "default", plateau: "rocks" },
  };

  const ts = d.tilesets;
  if (ts && typeof ts === "object") {
    const t = /** @type {Record<string, unknown>} */ (ts);
    if (typeof t.shore === "string") {
      map.tilesets.shore = t.shore;
    }
    if (typeof t.plateau === "string") {
      map.tilesets.plateau = t.plateau;
    }
  }

  ensureMapTilesets(map);
  ensureMapOverrideGrids(map);
  syncBarracksPointsFromBuildings(map);

  const pm = tryParsePathMaskFromJson(rawPathMask, width, height);
  if (pm) {
    map.pathMask = pm;
  } else if (rawEnemyPath != null) {
    const legacy = pathMaskFromLegacyEnemyPath(rawEnemyPath, width, height, map.points.enemyBarracks, map.points.homeBarracks);
    if (legacy) {
      map.pathMask = legacy;
    } else {
      console.warn("map enemyPath in JSON was invalid; using default L path mask");
      map.pathMask = buildDefaultPathMask(map.points.enemyBarracks, map.points.homeBarracks, width, height);
    }
  } else {
    map.pathMask = buildDefaultPathMask(map.points.enemyBarracks, map.points.homeBarracks, width, height);
  }
  ensurePathMaskGrid(map);
  return map;
}

/** @returns {object} fresh map object (deep clone from shipped default JSON) */
export function createFreshMap001() {
  return mapFromSerialized(JSON.parse(JSON.stringify(defaultMapJson)));
}
