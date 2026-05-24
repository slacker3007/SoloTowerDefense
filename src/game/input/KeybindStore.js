import Phaser from "phaser";

/** @typedef {"selectBlueBarracks"|"pause"|"cycleSpeed"|"cancelPlacement"|"backOrClose"|"grid_r1c1"|"grid_r1c2"|"grid_r1c3"|"grid_r1c4"|"grid_r1c5"|"grid_r1c6"|"grid_r1c7"|"grid_r1c8"|"grid_r1c9"|"grid_r1c10"} KeybindActionId */

export const GRID_KEYBIND_ACTION_IDS = /** @type {const} */ ([
  "grid_r1c1",
  "grid_r1c2",
  "grid_r1c3",
  "grid_r1c4",
  "grid_r1c5",
  "grid_r1c6",
  "grid_r1c7",
  "grid_r1c8",
  "grid_r1c9",
  "grid_r1c10",
]);

export const KEYBIND_ACTION_IDS = /** @type {const} */ ([
  "selectBlueBarracks",
  "pause",
  "cycleSpeed",
  "cancelPlacement",
  ...GRID_KEYBIND_ACTION_IDS,
  "backOrClose",
]);

/** @type {Record<KeybindActionId, string>} */
export const KEYBIND_DESCRIPTIONS = {
  selectBlueBarracks: "Select blue barracks",
  pause: "Pause / resume",
  cycleSpeed: "Cycle game speed",
  cancelPlacement: "Cancel placement",
  grid_r1c1: "Action slot 1 (1)",
  grid_r1c2: "Action slot 2 (2)",
  grid_r1c3: "Action slot 3 (3)",
  grid_r1c4: "Action slot 4 (4)",
  grid_r1c5: "Action slot 5 (5)",
  grid_r1c6: "Action slot 6 (6)",
  grid_r1c7: "Action slot 7 (7)",
  grid_r1c8: "Action slot 8 (8)",
  grid_r1c9: "Action slot 9 (9)",
  grid_r1c10: "Action slot 0 (0)",
  backOrClose: "Back / close",
};

const STORAGE_KEY = "soloTd.keybinds.v2";

const NUMBER_KEY_CODES = [
  Phaser.Input.Keyboard.KeyCodes.ONE,
  Phaser.Input.Keyboard.KeyCodes.TWO,
  Phaser.Input.Keyboard.KeyCodes.THREE,
  Phaser.Input.Keyboard.KeyCodes.FOUR,
  Phaser.Input.Keyboard.KeyCodes.FIVE,
  Phaser.Input.Keyboard.KeyCodes.SIX,
  Phaser.Input.Keyboard.KeyCodes.SEVEN,
  Phaser.Input.Keyboard.KeyCodes.EIGHT,
  Phaser.Input.Keyboard.KeyCodes.NINE,
  Phaser.Input.Keyboard.KeyCodes.ZERO,
];

/** @type {Record<KeybindActionId, number>} */
const DEFAULT_CODES = {
  selectBlueBarracks: Phaser.Input.Keyboard.KeyCodes.B,
  pause: Phaser.Input.Keyboard.KeyCodes.P,
  cycleSpeed: Phaser.Input.Keyboard.KeyCodes.SPACE,
  cancelPlacement: Phaser.Input.Keyboard.KeyCodes.ESC,
  grid_r1c1: NUMBER_KEY_CODES[0],
  grid_r1c2: NUMBER_KEY_CODES[1],
  grid_r1c3: NUMBER_KEY_CODES[2],
  grid_r1c4: NUMBER_KEY_CODES[3],
  grid_r1c5: NUMBER_KEY_CODES[4],
  grid_r1c6: NUMBER_KEY_CODES[5],
  grid_r1c7: NUMBER_KEY_CODES[6],
  grid_r1c8: NUMBER_KEY_CODES[7],
  grid_r1c9: NUMBER_KEY_CODES[8],
  grid_r1c10: NUMBER_KEY_CODES[9],
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
   * @returns {KeybindActionId | null}
   */
  findActionForCode(code) {
    if (!Number.isFinite(code)) {
      return null;
    }
    for (const id of KEYBIND_ACTION_IDS) {
      if (this._codes[id] === code) {
        return id;
      }
    }
    return null;
  }
}
