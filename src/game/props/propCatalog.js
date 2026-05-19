import { PROP_ASSETS, PROP_BY_KEY } from "../generated/propCatalog.js";

export { PROP_ASSETS, PROP_BY_KEY };

/**
 * @param {string} key
 */
export function getPropAsset(key) {
  return PROP_BY_KEY[key] ?? null;
}
