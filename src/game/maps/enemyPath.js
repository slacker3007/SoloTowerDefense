import { createElevation } from "./elevation";

/**
 * Cardinal steps from (ax, ay) to (bx, by), moving along x first then y.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {{ x: number, y: number }[]}
 */
export function cardinalPathHorizontalFirst(ax, ay, bx, by) {
  if (ax === bx && ay === by) {
    return [];
  }
  const out = [];
  let x = ax;
  let y = ay;
  while (x !== bx) {
    x += x < bx ? 1 : -1;
    out.push({ x, y });
  }
  while (y !== by) {
    y += y < by ? 1 : -1;
    out.push({ x, y });
  }
  return out;
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} tx
 * @param {number} ty
 * @returns {{ x: number, y: number }[]}
 */
function fullCardinalLPath(sx, sy, tx, ty) {
  const a = { x: sx, y: sy };
  if (sx === tx && sy === ty) {
    return [a];
  }
  const rest = cardinalPathHorizontalFirst(sx, sy, tx, ty);
  return [a, ...rest];
}

/**
 * 1 = may use in route; 0 = not. L-path between barracks, horizontal first then vertical.
 * @param {{ x: number, y: number }} spawn
 * @param {{ x: number, y: number }} target
 * @param {number} width
 * @param {number} height
 * @returns {number[][]}
 */
export function buildDefaultPathMask(spawn, target, width, height) {
  const m = createElevation(height, width, 0);
  const cells = fullCardinalLPath(spawn.x, spawn.y, target.x, target.y);
  for (const c of cells) {
    if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) {
      m[c.y][c.x] = 1;
    }
  }
  return m;
}

/**
 * @param {number[][]} pathMask
 * @param {{ x: number, y: number }} spawn
 * @param {{ x: number, y: number }} target
 */
export function ensurePathEndpointsInMask(pathMask, spawn, target) {
  if (pathMask[spawn.y] && pathMask[spawn.y][spawn.x] !== undefined) {
    pathMask[spawn.y][spawn.x] = 1;
  }
  if (pathMask[target.y] && pathMask[target.y][target.x] !== undefined) {
    pathMask[target.y][target.x] = 1;
  }
}

const NEI = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

/**
 * Barracks cells are always walkable for routing so the mask can omit them (e.g. "door" outside building).
 * @param {number} x
 * @param {number} y
 * @param {number[][]} pathMask
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 */
function cellPassableForRoute(x, y, pathMask, width, height, start, end) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  if (x === start.x && y === start.y) {
    return true;
  }
  if (x === end.x && y === end.y) {
    return true;
  }
  return Boolean(pathMask[y] && pathMask[y][x] === 1);
}

/**
 * 4-neighbor BFS on mask cells with value 1; start/end barracks are always passable.
 * @param {number[][]} pathMask
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @returns {{ x: number, y: number }[] | null}
 */
export function bfsPathOnMask(pathMask, width, height, start, end) {
  if (start.x === end.x && start.y === end.y) {
    return [{ x: start.x, y: start.y }];
  }
  if (
    end.x < 0 ||
    end.x >= width ||
    end.y < 0 ||
    end.y >= height ||
    !pathMask[end.y] ||
    !cellPassableForRoute(end.x, end.y, pathMask, width, height, start, end)
  ) {
    return null;
  }
  if (
    start.x < 0 ||
    start.x >= width ||
    start.y < 0 ||
    start.y >= height ||
    !pathMask[start.y] ||
    !cellPassableForRoute(start.x, start.y, pathMask, width, height, start, end)
  ) {
    return null;
  }

  const key = (x, y) => y * width + x;
  const seen = new Set();
  const prev = new Map();
  const q = /** @type {{x:number,y:number}[]} */ ([{ x: start.x, y: start.y }]);
  seen.add(key(start.x, start.y));
  const targetKey = key(end.x, end.y);

  while (q.length > 0) {
    const c = q.shift();
    if (!c) {
      break;
    }
    if (key(c.x, c.y) === targetKey) {
      const out = [];
      let cur = c;
      while (cur) {
        out.push({ x: cur.x, y: cur.y });
        const p = prev.get(key(cur.x, cur.y));
        if (!p) {
          break;
        }
        cur = p;
      }
      return out.reverse();
    }
    for (const d of NEI) {
      const nx = c.x + d.dx;
      const ny = c.y + d.dy;
      if (!cellPassableForRoute(nx, ny, pathMask, width, height, start, end)) {
        continue;
      }
      const k = key(nx, ny);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      prev.set(k, { x: c.x, y: c.y });
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * Ordered route cells for enemies, or null if BFS cannot connect spawn to target.
 * @param {object} map map with pathMask, width, height, points
 * @param {{ x: number, y: number }} [spawn] defaults map.points.enemyBarracks
 * @param {{ x: number, y: number }} [target] defaults map.points.homeBarracks
 * @returns {{ x: number, y: number }[] | null}
 */
export function computeRouteFromPathMask(map, spawn, target) {
  if (!map?.pathMask) {
    return null;
  }
  const s = spawn ?? map.points?.enemyBarracks;
  const t = target ?? map.points?.homeBarracks;
  if (!s || !t) {
    return null;
  }
  const pathMask = map.pathMask;
  const w = map.width;
  const h = map.height;
  return bfsPathOnMask(pathMask, w, h, s, t);
}

// --- legacy migration: old enemyPath JSON → pathMask ---

const LEGACY_20 = 20;

/**
 * @param {unknown} raw
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number }} spawn
 * @param {{ x: number, y: number }} target
 * @returns {number[][] | null}
 */
function tryLegacy20ToMask(raw, width, height, spawn, target) {
  const c = parseControlPoints20(raw, width, height, spawn, target);
  if (!c) {
    return null;
  }
  return cellsListToPathMask(expandControlPointsToCardinalPath(c), width, height);
}

function parseControlPoints20(raw, width, height, spawn, target) {
  if (!Array.isArray(raw) || raw.length !== LEGACY_20) {
    return null;
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    if (!p || typeof p !== "object") {
      return null;
    }
    const x = /** @type {{ x?: unknown, y?: unknown }} */ (p).x;
    const y = /** @type {{ x?: unknown, y?: unknown }} */ (p).y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const xi = Math.trunc(x);
    const yi = Math.trunc(y);
    if (xi !== x || yi !== y) {
      return null;
    }
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) {
      return null;
    }
    out.push({ x: xi, y: yi });
  }
  if (out[0].x !== spawn.x || out[0].y !== spawn.y) {
    return null;
  }
  const last = out[LEGACY_20 - 1];
  if (last.x !== target.x || last.y !== target.y) {
    return null;
  }
  return out;
}

/**
 * @param {{ x: number, y: number }[]} waypoints
 * @returns {{ x: number, y: number }[]}
 */
function expandControlPointsToCardinalPath(waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return [];
  }
  const out = [{ x: waypoints[0].x, y: waypoints[0].y }];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const mid = cardinalPathHorizontalFirst(a.x, a.y, b.x, b.y);
    for (let j = 0; j < mid.length; j += 1) {
      const c = mid[j];
      const last = out[out.length - 1];
      if (last.x !== c.x || last.y !== c.y) {
        out.push({ x: c.x, y: c.y });
      }
    }
  }
  return out;
}

function tryLegacyDenseToMask(raw, width, height, spawn, target) {
  if (!Array.isArray(raw) || raw.length < 2) {
    return null;
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    if (!p || typeof p !== "object") {
      return null;
    }
    const x = /** @type {{ x?: unknown, y?: unknown }} */ (p).x;
    const y = /** @type {{ y?: unknown }} */ (p).y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const xi = Math.trunc(x);
    const yi = Math.trunc(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) {
      return null;
    }
    out.push({ x: xi, y: yi });
  }
  if (out[0].x !== spawn.x || out[0].y !== spawn.y) {
    return null;
  }
  const lastC = out[out.length - 1];
  if (lastC.x !== target.x || lastC.y !== target.y) {
    return null;
  }
  for (let i = 1; i < out.length; i += 1) {
    const step = Math.abs(out[i].x - out[i - 1].x) + Math.abs(out[i].y - out[i - 1].y);
    if (step !== 1) {
      return null;
    }
  }
  return cellsListToPathMask(out, width, height);
}

/**
 * @param {{ x: number, y: number }[]} cells
 * @param {number} width
 * @param {number} height
 * @returns {number[][]}
 */
function cellsListToPathMask(cells, width, height) {
  const m = createElevation(height, width, 0);
  for (const c of cells) {
    if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) {
      m[c.y][c.x] = 1;
    }
  }
  return m;
}

/**
 * Build pathMask from legacy `enemyPath` in any supported format, or null.
 * @param {unknown} rawEnemyPath
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number }} spawn
 * @param {{ x: number, y: number }} target
 * @returns {number[][] | null}
 */
export function pathMaskFromLegacyEnemyPath(rawEnemyPath, width, height, spawn, target) {
  if (rawEnemyPath == null) {
    return null;
  }
  const m1 = tryLegacy20ToMask(rawEnemyPath, width, height, spawn, target);
  if (m1) {
    return m1;
  }
  return tryLegacyDenseToMask(rawEnemyPath, width, height, spawn, target);
}

/**
 * @param {unknown} raw
 * @param {number} width
 * @param {number} height
 * @returns {number[][] | null}
 */
export function tryParsePathMaskFromJson(raw, width, height) {
  if (!Array.isArray(raw) || raw.length !== height) {
    return null;
  }
  const m = createElevation(height, width, 0);
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
