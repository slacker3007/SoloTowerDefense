import Phaser from "phaser";
import { getTowerProjectileColor } from "../balance.js";
import { GAME_EVENT, gameEvents } from "../events.js";
import { prefersReducedMotion } from "../settings/accessibilitySettings.js";
import { cozyTheme } from "../ui/CozyTheme.js";
import { darkFantasyPalette } from "../ui/FantasyHudChrome.js";

const BANNER_TEXT_STYLE = {
  fontFamily: "system-ui, Segoe UI, sans-serif",
  fontSize: "26px",
  fontStyle: "bold",
  stroke: "#120d12",
  strokeThickness: 4,
  shadow: { offsetX: 0, offsetY: 2, color: "#000000", blur: 4, stroke: true, fill: true },
  letterSpacing: 1,
};

const FLOAT_GOLD_STYLE = {
  fontFamily: "system-ui, sans-serif",
  fontSize: "18px",
  fontStyle: "bold",
  color: "#ffe08a",
  stroke: "#120d12",
  strokeThickness: 3,
  shadow: { offsetX: 0, offsetY: 1, color: "#000000", blur: 3, stroke: true, fill: true },
};

/** Visual feedback keyed off {@link GAME_EVENT}s. Singleton; attach a scene once it exists. */

const BANNER_FADE_MS = 170;
const BANNER_GAP_MS = 120;

class FeedbackManager {
  constructor() {
    /** @type {import("phaser").Scene | null} */ this._scene = null;
    /** Timestamp (scene.time.now ms) at which the next banner is free to start. */
    this._bannerFreeAt = 0;
    this._bindEvents();
  }

  /** @param {import("phaser").Scene} scene */
  attachToScene(scene) {
    this._scene = scene;
    if (!scene.textures.exists("__WHITE")) {
      scene.textures.generate("__WHITE", { data: ["1"], pixelWidth: 1, pixelHeight: 1 });
    }
  }

  /** @returns {{ x: number, y: number } | null} */
  _worldFromEnemy(p) {
    const s = p?.enemy?.sprite;
    return s != null && Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null;
  }

  /** @returns {{ x: number, y: number } | null} */
  _worldFromTower(tower) {
    if (!tower) {
      return null;
    }
    if (tower.sprite != null && Number.isFinite(tower.sprite.x)) {
      return { x: tower.sprite.x, y: tower.sprite.y };
    }
    return Number.isFinite(tower.x) && Number.isFinite(tower.y) ? { x: tower.x, y: tower.y } : null;
  }

  /** @param {boolean} light */
  _shake(light) {
    const scene = this._scene;
    if (!scene || prefersReducedMotion()) {
      return;
    }
    const cam = scene.cameras?.main;
    if (!cam?.shake) {
      return;
    }
    cam.shake(light ? 160 : 240, light ? 0.004 : 0.007, true);
  }

  /** @param {string} headline @param {string} hex @param {number} hold */
  _banner(headline, hex, hold) {
    const scene = this._scene;
    if (!scene) {
      return;
    }
    const totalLifeMs = BANNER_FADE_MS * 2 + hold;
    const now = scene.time.now;
    const startInMs = Math.max(0, this._bannerFreeAt - now);
    this._bannerFreeAt = now + startInMs + totalLifeMs + BANNER_GAP_MS;

    if (startInMs > 0) {
      scene.time.delayedCall(startInMs, () => this._spawnBanner(headline, hex, hold));
    } else {
      this._spawnBanner(headline, hex, hold);
    }
  }

  /** @param {string} headline @param {string} hex @param {number} hold */
  _spawnBanner(headline, hex, hold) {
    const scene = this._scene;
    if (!scene) {
      return;
    }
    const { width, height } = scene.scale;
    const reduced = prefersReducedMotion();
    const anchorY = Math.min(height * 0.16, 108);

    const txt = scene.add.text(0, 0, headline, {
      ...BANNER_TEXT_STYLE,
      color: hex,
    });
    txt.setOrigin(0.5);

    const padX = 24;
    const padY = 12;
    const pillW = txt.width + padX * 2;
    const pillH = txt.height + padY * 2;
    const radius = 10;

    const gfx = scene.add.graphics();
    gfx.fillStyle(darkFantasyPalette.trayBase, 0.88);
    gfx.fillRoundedRect(-pillW * 0.5, -pillH * 0.5, pillW, pillH, radius);
    gfx.lineStyle(2, cozyTheme.colors.panelBorder, 1);
    gfx.strokeRoundedRect(-pillW * 0.5, -pillH * 0.5, pillW, pillH, radius);

    const container = scene.add.container(width * 0.5, anchorY, [gfx, txt]);
    container.setScrollFactor(0).setDepth(9800).setAlpha(0);

    const tweenProps = {
      targets: container,
      alpha: { from: 0, to: 1 },
      duration: BANNER_FADE_MS,
      hold,
      ease: "Cubic.Out",
      yoyo: true,
      onComplete: () => container.destroy(true),
    };

    if (reduced) {
      scene.tweens.add(tweenProps);
      return;
    }

    container.setY(anchorY + 8);
    scene.tweens.add({ ...tweenProps, y: anchorY });
  }

  /** @param {number} gx @param {number} gy @param {number} amt */
  _floatGold(gx, gy, amt) {
    const scene = this._scene;
    if (!scene || !(amt > 0)) {
      return;
    }
    const t = scene.add
      .text(gx, gy - 40, `+${Math.round(amt)} G`, FLOAT_GOLD_STYLE)
      .setDepth(9550)
      .setOrigin(0.5, 1);
    scene.tweens.add({
      targets: t,
      y: t.y - 44,
      alpha: 0,
      duration: 520,
      ease: "Quad.Out",
      onComplete: () => t.destroy(),
    });
  }

  /** @param {unknown} payload */
  _onTowerFire(payload) {
    const scene = this._scene;
    if (!scene || prefersReducedMotion()) {
      return;
    }
    const p = /** @type {{ tower?: { type?: string, sprite?: Phaser.GameObjects.GameObject & { scaleY?: number, active?: boolean } } }} */ (
      payload
    );
    const tower = p?.tower;
    const xy = this._worldFromTower(tower);
    if (!xy) {
      return;
    }
    const color = getTowerProjectileColor(tower?.type ?? "basic");
    const parent = scene.effectsWorldLayer ?? scene.worldRoot;
    const flash = scene.add
      .circle(xy.x, xy.y - 6, 10, color, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (parent) {
      parent.add(flash);
    }
    scene.tweens.add({
      targets: flash,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 110,
      ease: "Quad.Out",
      onComplete: () => flash.destroy(),
    });
    const sp = tower?.sprite;
    if (sp?.active && typeof sp.scaleY === "number") {
      const baseY = sp.scaleY;
      scene.tweens.add({
        targets: sp,
        scaleY: baseY * 0.94,
        duration: 35,
        yoyo: true,
        ease: "Quad.Out",
      });
    }
  }

  /** @param {number} x @param {number} y */
  _sparkles(x, y) {
    const scene = this._scene;
    if (!scene || !scene.textures.exists("__WHITE")) {
      return;
    }
    const p = scene.add.particles(x, y, "__WHITE", {
      lifespan: { min: 260, max: 520 },
      speed: { min: 40, max: 150 },
      angle: { min: 0, max: 360 },
      gravityY: -42,
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xfff2a7, 0xffe066, 0xffffff],
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
    });
    p.setDepth(9520);
    p.explode(22);
    scene.time.delayedCall(680, () => p.destroy());
  }

  /**
   * @param {number} a
   * @param {number} b
   * @param {number} t01
   */
  _lerpRgb(a, b, t01) {
    const ca = Phaser.Display.Color.IntegerToColor(a);
    const cb = Phaser.Display.Color.IntegerToColor(b);
    const i = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t01 * 100));
    return Phaser.Display.Color.GetColor(i.r, i.g, i.b);
  }

  /** @param {unknown} payload */
  _hitFlash(payload) {
    const sp =
      typeof payload === "object" && payload && "enemy" in payload && payload.enemy && typeof payload.enemy === "object"
        ? /** @type {{ sprite?: unknown }} */ (payload.enemy).sprite
        : null;
    const scene = this._scene;
    if (!scene || !sp?.active || !sp.scene) {
      return;
    }
    const reduced = prefersReducedMotion();
    const dur = reduced ? 1 : 130;

    if ("fillColor" in sp && typeof sp.setFillStyle === "function") {
      const prevFill = /** @type {number} */ (sp.fillColor);
      const flash = 0xff9a9a;
      const g = { t: 0 };
      scene.tweens.add({
        targets: g,
        t: 1,
        duration: dur,
        ease: "Quad.Out",
        onUpdate: () => {
          if (!sp.active) {
            return;
          }
          sp.setFillStyle(this._lerpRgb(flash, prevFill ?? 0xcf3f3f, g.t));
          if (typeof sp.scaleY === "number") {
            if (sp._baseScaleY == null) {
              sp._baseScaleY = sp.scaleY;
            }
            sp.scaleY = sp._baseScaleY * (1 - 0.06 * (1 - g.t));
          }
        },
        onComplete: () => {
          try {
            if (sp.active && typeof sp.setFillStyle === "function") {
              sp.setFillStyle(prevFill ?? 0xcf3f3f);
            }
            if (sp._baseScaleY != null && typeof sp.scaleY === "number") {
              sp.scaleY = sp._baseScaleY;
            }
          } catch {
            /* noop */
          }
        },
      });
      return;
    }

    if (typeof sp.setTint === "function") {
      const endTint = "tintTopLeft" in sp && typeof sp.tintTopLeft === "number" ? sp.tintTopLeft : 0xffffff;
      const flash = 0xff9999;
      const g = { t: 0 };
      scene.tweens.add({
        targets: g,
        t: 1,
        duration: dur,
        ease: "Quad.Out",
        onUpdate: () => {
          if (!sp.active) {
            return;
          }
          sp.setTint(this._lerpRgb(flash, endTint, g.t));
          if (typeof sp.scaleY === "number") {
            if (sp._baseScaleY == null) {
              sp._baseScaleY = sp.scaleY;
            }
            sp.scaleY = sp._baseScaleY * (1 - 0.06 * (1 - g.t));
          }
        },
        onComplete: () => {
          try {
            if (!sp.active) {
              return;
            }
            if (endTint === 0xffffff && typeof sp.clearTint === "function") {
              sp.clearTint();
            } else {
              sp.setTint(endTint);
            }
            if (sp._baseScaleY != null && typeof sp.scaleY === "number") {
              sp.scaleY = sp._baseScaleY;
            }
          } catch {
            /* noop */
          }
        },
      });
    }
  }

  /** @param {unknown} payload */
  _streakBanner(payload) {
    const scene = this._scene;
    if (!scene || prefersReducedMotion()) {
      return;
    }
    const p = /** @type {{ count?: number, x?: number, y?: number }} */ (payload);
    const count = Number(p?.count);
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const txt = scene.add
      .text(x, y - 48, `x${count} STREAK!`, {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ffe08a",
        stroke: "#120d12",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(9560);
    const parent = scene.effectsWorldLayer ?? scene.worldRoot;
    if (parent) {
      parent.add(txt);
    }
    scene.tweens.add({
      targets: txt,
      y: txt.y - 36,
      alpha: 0,
      duration: 720,
      ease: "Quad.Out",
      onComplete: () => txt.destroy(),
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} count
   * @param {number} tint
   * @param {boolean} [additive]
   */
  _dustBurst(x, y, count, tint, additive = false) {
    const scene = this._scene;
    if (!scene || prefersReducedMotion() || !scene.textures.exists("fxDust02")) {
      return;
    }
    const parent = scene.effectsWorldLayer ?? scene.worldRoot;
    const p = scene.add.particles(x, y, "fxDust02", {
      frame: [0, 1, 2, 3],
      lifespan: { min: 220, max: 400 },
      speed: { min: 30, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint,
      blendMode: additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      emitting: false,
    });
    if (parent) {
      parent.add(p);
    }
    p.explode(count);
    scene.time.delayedCall(480, () => p.destroy());
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} towerType
   */
  _elementDeathFx(x, y, towerType) {
    const scene = this._scene;
    if (!scene || prefersReducedMotion()) {
      return;
    }
    const parent = scene.effectsWorldLayer ?? scene.worldRoot;
    if (towerType === "fire" && scene.textures.exists("fire01Sheet")) {
      const fire = scene.add.sprite(x, y, "fire01Sheet", 0);
      if (parent) {
        parent.add(fire);
      }
      if (scene.anims.exists("fire-01-loop")) {
        fire.play({ key: "fire-01-loop", repeat: 0 });
      }
      scene.time.delayedCall(400, () => {
        if (fire.active) {
          fire.destroy();
        }
      });
      return;
    }
    if (towerType === "ice") {
      this._dustBurst(x, y, 8, 0xa8d8ff, true);
      return;
    }
    if (towerType === "earth") {
      this._dustBurst(x, y, 12, 0x8b6914, false);
      return;
    }
    if (towerType === "holy") {
      const ring = scene.add.circle(x, y, 6, 0xfff2a7, 0.35);
      if (parent) {
        parent.add(ring);
      }
      scene.tweens.add({
        targets: ring,
        scaleX: 1.6,
        scaleY: 1.6,
        alpha: 0,
        duration: 180,
        ease: "Quad.Out",
        onComplete: () => ring.destroy(),
      });
      return;
    }
    const pop = scene.add.circle(x, y, 16, 0xffffff, 0.45);
    if (parent) {
      parent.add(pop);
    }
    scene.tweens.add({
      targets: pop,
      scaleX: 2.35,
      scaleY: 2.35,
      alpha: 0,
      duration: 240,
      ease: "Quad.Out",
      onComplete: () => pop.destroy(),
    });
    this._dustBurst(x, y, 4, 0xffffff, false);
  }

  /** @param {unknown} payload */
  _deathAndGold(payload) {
    const scene = this._scene;
    const p = /** @type {{ enemy?: object, tower?: { type?: string }, gold?: number }} */ (payload);
    if (!scene) {
      return;
    }
    const xy = this._worldFromEnemy(p);
    const cam = scene.cameras.main;
    const gx = xy?.x ?? cam?.worldView?.centerX ?? 0;
    const gy = xy?.y ?? cam?.worldView?.centerY ?? 0;

    if (xy) {
      const towerType = p?.tower?.type ?? "basic";
      this._elementDeathFx(xy.x, xy.y, towerType);
    }

    const g = Number(p?.gold);
    if (Number.isFinite(g) && g > 0) {
      this._floatGold(gx, gy, g);
    }
  }

  _leakVignette() {
    const scene = this._scene;
    if (!scene) {
      return;
    }
    const { width, height } = scene.scale;
    const v = scene.add
      .rectangle(width * 0.5, height * 0.5, width, height, 0x460016, 1)
      .setScrollFactor(0)
      .setDepth(9700)
      .setAlpha(0);
    scene.tweens.add({
      targets: v,
      alpha: { from: 0, to: 0.52 },
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: "Sine.Out",
      onComplete: () => v.destroy(),
    });
  }

  /** @param {unknown} payload */
  _waveLine(payload) {
    const o = /** @type {{ wave?: number, waveIndex?: number }} */ (payload);
    const wi = Number(o?.wave ?? o?.waveIndex);
    return Number.isFinite(wi) && wi >= 1 ? `Wave ${wi}` : "";
  }

  _bindEvents() {
    gameEvents.on(GAME_EVENT.TOWER_FIRE, (p) => this._onTowerFire(p));
    gameEvents.on(GAME_EVENT.KILL_STREAK, (p) => this._streakBanner(p));
    gameEvents.on(GAME_EVENT.ENEMY_HIT, (p) => this._hitFlash(p));
    gameEvents.on(GAME_EVENT.ENEMY_KILLED, (p) => this._deathAndGold(p));
    gameEvents.on(GAME_EVENT.ENEMY_LEAK, () => {
      this._shake(false);
      this._leakVignette();
    });
    gameEvents.on(GAME_EVENT.BOSS_ALERT, () => this._shake(true));
    gameEvents.on(GAME_EVENT.WAVE_STARTED, (p) => {
      const line = this._waveLine(p);
      this._banner(line ? line.toUpperCase() : "WAVE START", "#ffdfb5", 720);
    });
    gameEvents.on(GAME_EVENT.WAVE_CLEARED, (p) => {
      const base = this._waveLine(p);
      const headline = `${base ? `${base.toUpperCase()} — ` : ""}CLEARED`;
      this._banner(headline, "#bdf8dc", 900);
    });
    gameEvents.on(GAME_EVENT.TOWER_UPGRADED, (payload) => {
      const t = typeof payload === "object" && payload && "tower" in payload ? payload.tower : undefined;
      const xy = this._worldFromTower(t);
      if (xy) {
        this._sparkles(xy.x, xy.y);
      }
    });
    gameEvents.on(GAME_EVENT.TOWER_CONVERTED, (payload) => {
      const t = typeof payload === "object" && payload && "tower" in payload ? payload.tower : undefined;
      const xy = this._worldFromTower(t);
      if (xy) {
        this._sparkles(xy.x, xy.y);
      }
    });
  }
}

export const feedbackManager = new FeedbackManager();
