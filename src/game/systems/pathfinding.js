import { isInsideGrid } from "../maps/tileRules";

const CARDINAL_NEIGHBORS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

/**
 * Cardinal steps ordered so ties prefer moving closer to goal (same BFS length, better visuals).
 * @param {number} cx
 * @param {number} cy
 * @param {{ x: number, y: number }} goalCell
 */
function neighborsTowardGoal(cx, cy, goalCell) {
  return CARDINAL_NEIGHBORS.slice().sort((a, b) => {
    const distA = Math.abs(cx + a.x - goalCell.x) + Math.abs(cy + a.y - goalCell.y);
    const distB = Math.abs(cx + b.x - goalCell.x) + Math.abs(cy + b.y - goalCell.y);
    if (distA !== distB) {
      return distA - distB;
    }
    const rank = (d) => (d.x === 1 ? 0 : d.y === -1 ? 1 : d.x === -1 ? 2 : 3);
    return rank(a) - rank(b);
  });
}

/**
 * @param {{ x: number, y: number }} startCell
 * @param {{ x: number, y: number }} goalCell
 * @param {(cellX: number, cellY: number) => boolean} isWalkable
 * @param {{ width: number, height: number }} grid
 * @returns {Array<{ x: number, y: number }> | null}
 */
export function findGridPath(startCell, goalCell, isWalkable, grid) {
  if (
    !isInsideGrid(startCell.x, startCell.y, grid.width, grid.height) ||
    !isInsideGrid(goalCell.x, goalCell.y, grid.width, grid.height)
  ) {
    return null;
  }

  const startKey = cellKey(startCell);
  const goalKey = cellKey(goalCell);
  const queue = [{ x: startCell.x, y: startCell.y }];
  const parentByKey = new Map();
  parentByKey.set(startKey, null);

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const currentKey = cellKey(current);
    if (currentKey === goalKey) {
      break;
    }

    for (const delta of neighborsTowardGoal(current.x, current.y, goalCell)) {
      const nx = current.x + delta.x;
      const ny = current.y + delta.y;
      if (!isInsideGrid(nx, ny, grid.width, grid.height)) {
        continue;
      }
      if (!isWalkable(nx, ny)) {
        continue;
      }

      const next = { x: nx, y: ny };
      const nextKey = cellKey(next);
      if (parentByKey.has(nextKey)) {
        continue;
      }

      parentByKey.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  if (!parentByKey.has(goalKey)) {
    return null;
  }

  const path = [];
  let cursorKey = goalKey;
  while (cursorKey != null) {
    const [x, y] = cursorKey.split(",").map((value) => Number(value));
    path.push({ x, y });
    cursorKey = parentByKey.get(cursorKey) ?? null;
  }
  path.reverse();

  return path;
}
