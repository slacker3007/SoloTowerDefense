import { UI_ASSETS, UI_BY_KEY } from "../generated/uiCatalog.js";

export { UI_ASSETS, UI_BY_KEY };

/**
 * @param {string} key
 */
export function getUiAsset(key) {
  return UI_BY_KEY[key] ?? null;
}
