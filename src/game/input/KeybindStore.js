import Phaser from "phaser";

/** @typedef {"selectBlueBarracks"|"backOrClose"|"grid_r1c1"|"grid_r1c2"|"grid_r1c3"|"grid_r1c4"|"grid_r2c1"|"grid_r2c2"|"grid_r2c3"|"grid_r2c4"|"grid_r3c1"|"grid_r3c2"|"grid_r3c3"|"grid_r3c4"} KeybindActionId */

export const GRID_KEYBIND_ACTION_IDS = /** @type {const} */ ([
  "grid_r1c1",
  "grid_r1c2",
  "grid_r1c3",
  "grid_r1c4",
  "grid_r2c1",
  "grid_r2c2",
  "grid_r2c3",
  "grid_r2c4",
  "grid_r3c1",
  "grid_r3c2",
  "grid_r3c3",
  "grid_r3c4",
]);

export const KEYBIND_ACTION_IDS = /** @type {const} */ ([
  "selectBlueBarracks",
  ...GRID_KEYBIND_ACTION_IDS,
  "backOrClose",
]);

/** @type {Record<KeybindActionId, string>} */
export const KEYBIND_DESCRIPTIONS = {
  selectBlueBarracks: "Select blue barracks",
  grid_r1c1: "Action slot 1 (Q, top-left)",
  grid_r1c2: "Action slot 2 (W)",
  grid_r1c3: "Action slot 3 (E)",
  grid_r1c4: "Action slot 4 (R, top-right)",
  grid_r2c1: "Action slot 5 (A)",
  grid_r2c2: "Action slot 6 (S)",
  grid_r2c3: "Action slot 7 (D)",
  grid_r2c4: "Action slot 8 (F)",
  grid_r3c1: "Action slot 9 (Z, bottom-left)",
  grid_r3c2: "Action slot 10 (X)",
  grid_r3c3: "Action slot 11 (C)",
  grid_r3c4: "Action slot 12 (V, bottom-right)",
  backOrClose: "Back / close",
};

const STORAGE_KEY = "soloTd.keybinds.v1";

/** @type {Record<KeybindActionId, number>} */
const DEFAULT_CODES = {
  selectBlueBarracks: Phaser.Input.Keyboard.KeyCodes.ONE,
  grid_r1c1: Phaser.Input.Keyboard.KeyCodes.Q,
  grid_r1c2: Phaser.Input.Keyboard.KeyCodes.W,
  grid_r1c3: Phaser.Input.Keyboard.KeyCodes.E,
  grid_r1c4: Phaser.Input.Keyboard.KeyCodes.R,
  grid_r2c1: Phaser.Input.Keyboard.KeyCodes.A,
  grid_r2c2: Phaser.Input.Keyboard.KeyCodes.S,
  grid_r2c3: Phaser.Input.Keyboard.KeyCodes.D,
  grid_r2c4: Phaser.Input.Keyboard.KeyCodes.F,
  grid_r3c1: Phaser.Input.Keyboard.KeyCodes.Z,
  grid_r3c2: Phaser.Input.Keyboard.KeyCodes.X,
  grid_r3c3: Phaser.Input.Keyboard.KeyCodes.C,
  grid_r3c4: Phaser.Input.Keyboard.KeyCodes.V,
  backOrClose: Phaser.Input.Keyboard.KeyCodes.ESC,
};

/**
 * @param {number} code
 * @returns {string}
 */
export function formatKeyLabel(code) {
  if (!Number.isFinite(code)) {
    return "?";
  }
  if (code === Phaser.Input.Keyboard.KeyCodes.ESC) {
    return "Esc";
  }
  if (code === Phaser.Input.Keyboard.KeyCodes.SPACE) {
    return "Space";
  }
  if (code === Phaser.Input.Keyboard.KeyCodes.ENTER) {
    return "Enter";
  }
  if (code === Phaser.Input.Keyboard.KeyCodes.TAB) {
    return "Tab";
  }
  if (code >= Phaser.Input.Keyboard.KeyCodes.ZERO && code <= Phaser.Input.Keyboard.KeyCodes.NINE) {
    return String(code - Phaser.Input.Keyboard.KeyCodes.ZERO);
  }
  if (code >= Phaser.Input.Keyboard.KeyCodes.A && code <= Phaser.Input.Keyboard.KeyCodes.Z) {
    return String.fromCharCode(code);
  }
  return `Key ${code}`;
}

/**
 * @param {KeyboardEvent} ev
 * @returns {number | null}
 */
export function keyCodeFromBrowserEvent(ev) {
  if (ev.repeat) {
    return null;
  }
  const k = ev.key;
  if (k === "Escape") {
    return Phaser.Input.Keyboard.KeyCodes.ESC;
  }
  if (k === " " || k === "Spacebar") {
    return Phaser.Input.Keyboard.KeyCodes.SPACE;
  }
  if (k === "Enter") {
    return Phaser.Input.Keyboard.KeyCodes.ENTER;
  }
  if (k === "Tab") {
    return Phaser.Input.Keyboard.KeyCodes.TAB;
  }
  if (k.length === 1) {
    const upper = k.toUpperCase();
    const c = upper.charCodeAt(0);
    if (c >= 65 && c <= 90) {
      return c;
    }
    if (c >= 48 && c <= 57) {
      return c;
    }
  }
  if (typeof ev.keyCode === "number" && ev.keyCode > 0) {
    return ev.keyCode;
  }
  return null;
}

/**
 * @param {KeyboardEvent} ev
 * @returns {boolean}
 */
export function isModifierOnlyEvent(ev) {
  const code = ev.keyCode;
  return (
    code === Phaser.Input.Keyboard.KeyCodes.SHIFT ||
    code === Phaser.Input.Keyboard.KeyCodes.CTRL ||
    code === Phaser.Input.Keyboard.KeyCodes.ALT
  );
}

export class KeybindStore {
  constructor() {
    /** @type {Record<KeybindActionId, number>} */
    this._codes = { ...DEFAULT_CODES };
    this.load();
  }

  /** @returns {Record<KeybindActionId, number>} */
  getCodes() {
    return { ...this._codes };
  }

  /**
   * @param {KeybindActionId} actionId
   * @returns {number}
   */
  getCode(actionId) {
    return this._codes[actionId] ?? DEFAULT_CODES[actionId];
  }

  resetToDefaults() {
    this._codes = { ...DEFAULT_CODES };
    this.save();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return;
      }
      for (const id of KEYBIND_ACTION_IDS) {
        const v = parsed[id];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          this._codes[id] = v;
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._codes));
    } catch {
      // ignore quota / private mode
    }
  }

  /**
   * @param {KeybindActionId} actionId
   * @param {number} code
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  setBinding(actionId, code) {
    if (!KEYBIND_ACTION_IDS.includes(actionId)) {
      return { ok: false, reason: "Unknown action" };
    }
    const other = KEYBIND_ACTION_IDS.find((id) => id !== actionId && this._codes[id] === code);
    if (other) {
      return { ok: false, reason: "Key already used" };
    }
    this._codes[actionId] = code;
    this.save();
    return { ok: true };
  }

  /**
   * @param {number} code
   * @param {KeybindActionId | null} exceptActionId
   * @returns {KeybindActionId | null}
   */
  findActionForCode(code, exceptActionId = null) {
    for (const id of KEYBIND_ACTION_IDS) {
      if (id === exceptActionId) {
        continue;
      }
      if (this._codes[id] === code) {
        return id;
      }
    }
    return null;
  }
}
