/**
 * @param {unknown} v
 * @returns {{ assetKey: string, frame: number } | null}
 */
export function normalizeAssetPlacement(v) {
  if (v == null || typeof v !== "object") {
    return null;
  }
  const o = /** @type {Record<string, unknown>} */ (v);
  if (typeof o.assetKey !== "string") {
    return null;
  }
  const frame = typeof o.frame === "number" && Number.isFinite(o.frame) ? Math.floor(o.frame) : 0;
  return { assetKey: o.assetKey, frame };
}

/**
 * @param {{ assetKey: string, frame: number } | null} cell
 */
export function cloneAssetPlacement(cell) {
  if (cell == null) {
    return null;
  }
  return { assetKey: cell.assetKey, frame: cell.frame };
}
