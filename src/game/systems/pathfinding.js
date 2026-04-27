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

    for (const delta of CARDINAL_NEIGHBORS) {
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
