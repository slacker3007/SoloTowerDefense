const STORAGE_KEY = "soloTd.accessibility.v1";

/** @type {{ reducedMotion: boolean, textScale: number, colorblindMode: boolean, highContrastHp: boolean }} */
const DEFAULTS = {
  reducedMotion: false,
  textScale: 1,
  colorblindMode: false,
  highContrastHp: false,
};

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

/** @returns {typeof DEFAULTS} */
export function getAccessibilitySettings() {
  const raw = readRaw();
  if (!raw) {
    return { ...DEFAULTS };
  }
  try {
    const o = JSON.parse(raw);
    const textScale = Number(o?.textScale);
    return {
      reducedMotion: Boolean(o?.reducedMotion),
      textScale: Number.isFinite(textScale) ? Math.min(1.5, Math.max(0.85, textScale)) : DEFAULTS.textScale,
      colorblindMode: Boolean(o?.colorblindMode),
      highContrastHp: Boolean(o?.highContrastHp),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {Partial<typeof DEFAULTS>} patch */
export function setAccessibilitySettings(patch) {
  const cur = getAccessibilitySettings();
  const next = {
    reducedMotion: patch.reducedMotion != null ? Boolean(patch.reducedMotion) : cur.reducedMotion,
    textScale:
      patch.textScale != null && Number.isFinite(Number(patch.textScale))
        ? Math.min(1.5, Math.max(0.85, Number(patch.textScale)))
        : cur.textScale,
    colorblindMode: patch.colorblindMode != null ? Boolean(patch.colorblindMode) : cur.colorblindMode,
    highContrastHp: patch.highContrastHp != null ? Boolean(patch.highContrastHp) : cur.highContrastHp,
  };
  writeRaw(JSON.stringify(next));
  return next;
}

export function getTextScaleChoices() {
  return [0.85, 1, 1.15, 1.3, 1.5];
}

export function prefersReducedMotion() {
  if (getAccessibilitySettings().reducedMotion) {
    return true;
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return true;
  }
  return false;
}
