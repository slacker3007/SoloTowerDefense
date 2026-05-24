const STORAGE_KEY = "soloTd.audio.v1";

/** @type {{ master: number, music: number, sfx: number, muted: boolean }} */
const DEFAULTS = {
  master: 0.85,
  music: 0.7,
  sfx: 0.85,
  muted: false,
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

function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** @returns {{ master: number, music: number, sfx: number, muted: boolean }} */
export function getAudioSettings() {
  const raw = readRaw();
  if (!raw) {
    return { ...DEFAULTS };
  }
  try {
    const o = JSON.parse(raw);
    return {
      master: clamp01(o?.master, DEFAULTS.master),
      music: clamp01(o?.music, DEFAULTS.music),
      sfx: clamp01(o?.sfx, DEFAULTS.sfx),
      muted: Boolean(o?.muted),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {{ master?: number, music?: number, sfx?: number, muted?: boolean }} patch */
export function setAudioSettings(patch) {
  const cur = getAudioSettings();
  const next = {
    master: patch.master != null ? clamp01(patch.master, cur.master) : cur.master,
    music: patch.music != null ? clamp01(patch.music, cur.music) : cur.music,
    sfx: patch.sfx != null ? clamp01(patch.sfx, cur.sfx) : cur.sfx,
    muted: patch.muted != null ? Boolean(patch.muted) : cur.muted,
  };
  writeRaw(JSON.stringify(next));
  return next;
}

export function getAudioSettingDefaults() {
  return { ...DEFAULTS };
}
