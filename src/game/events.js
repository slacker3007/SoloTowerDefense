/** @typedef {Record<string, unknown>} GameEventPayload */

/** Lightweight global event bus for cross-system hooks (audio, HUD, tutorial, FX). */
class GameEventBus {
  constructor() {
    /** @type {Map<string, Set<(payload: GameEventPayload) => void>>} */
    this._listeners = new Map();
  }

  /**
   * @param {string} event
   * @param {(payload: GameEventPayload) => void} fn
   */
  on(event, fn) {
    if (typeof event !== "string" || typeof fn !== "function") {
      return;
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
  }

  /**
   * @param {string} event
   * @param {(payload: GameEventPayload) => void} fn
   */
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  /**
   * @param {string} event
   * @param {GameEventPayload} [payload]
   */
  emit(event, payload = {}) {
    const set = this._listeners.get(event);
    if (!set) {
      return;
    }
    for (const fn of set) {
      try {
        fn(payload);
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

export const gameEvents = new GameEventBus();

export const GAME_EVENT = {
  ENEMY_KILLED: "enemy-killed",
  ENEMY_HIT: "enemy-hit",
  ENEMY_LEAK: "enemy-leak",
  GOLD_CHANGED: "gold-changed",
  LIVES_CHANGED: "lives-changed",
  WAVE_STARTED: "wave-started",
  WAVE_CLEARED: "wave-cleared",
  BOSS_ALERT: "boss-alert",
  TOWER_BUILD_STARTED: "tower-build-started",
  TOWER_BUILT: "tower-built",
  TOWER_FIRE: "tower-fire",
  TOWER_UPGRADED: "tower-upgraded",
  TOWER_SOLD: "tower-sold",
  TOWER_CONVERTED: "tower-converted",
  RUN_END: "run-end",
  PAUSE_CHANGED: "pause-changed",
  TUTORIAL_STEP: "tutorial-step",
};
