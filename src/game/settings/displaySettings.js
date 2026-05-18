const STORAGE_KEY = "soloTd.display.v1";

/** @type {{ hudScale: number }} */
const DEFAULTS = {
  hudScale: 1,
};

const HUD_SCALE_CHOICES = [0.8, 0.9, 1, 1.1, 1.2];

function readRaw() {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(json) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ hudScale: number }}
 */
export function getDisplaySettings() {
  const raw = readRaw();
  if (!raw) {
    return { ...DEFAULTS };
  }
  try {
    const o = JSON.parse(raw);
    const hudScale = Number(o?.hudScale);
    const scale =
      Number.isFinite(hudScale) && hudScale > 0 ? Math.min(1.5, Math.max(0.5, hudScale)) : DEFAULTS.hudScale;
    return { hudScale: scale };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {number} hudScale
 */
export function setHudScalePreference(hudScale) {
  const s = Number(hudScale);
  const next = Number.isFinite(s) ? Math.min(1.5, Math.max(0.5, s)) : DEFAULTS.hudScale;
  writeRaw(JSON.stringify({ hudScale: next }));
}

export function getHudScaleChoices() {
  return [...HUD_SCALE_CHOICES];
}

/**
 * @returns {HTMLElement | null}
 */
export function getFullscreenTarget() {
  if (typeof document === "undefined") {
    return null;
  }
  return /** @type {HTMLElement | null} */ (document.getElementById("app")) ?? document.documentElement;
}

/**
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function toggleFullscreenPreferred() {
  const el = getFullscreenTarget();
  if (!el || typeof document === "undefined") {
    return { ok: false, reason: "Fullscreen not available." };
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else {
      return { ok: false, reason: "Fullscreen is not supported in this browser." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(/** @type {{ message?: string }} */ (e).message) : "Could not change fullscreen.";
    return { ok: false, reason: msg };
  }
}
