import { UNIT_ASSETS, UNIT_BY_KEY } from "../generated/unitCatalog.js";

export { UNIT_ASSETS, UNIT_BY_KEY };

/**
 * @param {string} key
 */
export function getUnitAsset(key) {
  return UNIT_BY_KEY[key] ?? null;
}
