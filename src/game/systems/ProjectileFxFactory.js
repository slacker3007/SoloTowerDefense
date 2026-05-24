import Phaser from "phaser";
import { towerProjectileColors } from "../balance";

const TOWER_TYPES = ["basic", "archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"];

export const MAX_TIER_RING_KEY = "fx_max_tier_ring";

const PROJ_SIZE = 32;
const MUZZLE_SIZE = 24;
const RING_W = 96;
const RING_H = 40;

let bootstrapped = false;

/**
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {number} w
 * @param {number} h
 * @param {(g: Phaser.GameObjects.Graphics, w: number, h: number) => void} drawFn
 */
function bakeTexture(scene, key, w, h, drawFn) {
  if (scene.textures.exists(key)) {
    return;
  }
  const rt = scene.add.renderTexture(0, 0, w, h);
  const g = scene.add.graphics();
  drawFn(g, w, h);
  rt.draw(g, 0, 0);
  g.destroy();
  rt.saveTexture(key);
  rt.destroy();
}

/**
 * @param {string} towerType
 * @returns {string}
 */
export function getProjectileTextureKey(towerType) {
  const type = TOWER_TYPES.includes(towerType) ? towerType : "basic";
  const key = `fx_proj_${type}`;
  return key;
}

/**
 * @param {string} towerType
 * @returns {string}
 */
export function getMuzzleTextureKey(towerType) {
  const type = TOWER_TYPES.includes(towerType) ? towerType : "basic";
  return `fx_muzzle_${type}`;
}

/** Tower types that use additive blend on projectiles. */
export const ADDITIVE_PROJECTILE_TYPES = new Set(["fire", "lightning"]);

/** Tower types that rotate projectile sprite along velocity. */
export const ROTATING_PROJECTILE_TYPES = new Set(["basic", "archer"]);

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} cx
 * @param {number} cy
 * @param {number} color
 * @param {number} [alpha]
 */
function fillCircle(g, cx, cy, r, color, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillCircle(cx, cy, r);
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {string} type
 * @param {number} w
 * @param {number} h
 */
function drawProjectile(g, type, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const color = towerProjectileColors[type] ?? towerProjectileColors.basic;

  switch (type) {
    case "basic": {
      fillCircle(g, cx, cy, 10, color, 0.35);
      fillCircle(g, cx, cy, 6, color, 1);
      fillCircle(g, cx, cy, 2.5, 0xffffff, 0.55);
      break;
    }
    case "archer": {
      g.fillStyle(color, 1);
      g.fillTriangle(cx + 11, cy, cx - 8, cy - 3, cx - 8, cy + 3);
      g.fillStyle(0xffffff, 0.45);
      g.fillTriangle(cx + 11, cy, cx + 4, cy - 1.5, cx + 4, cy + 1.5);
      g.fillStyle(0x8b6914, 1);
      g.fillRect(cx - 10, cy - 1.2, 8, 2.4);
      g.fillStyle(0xc9a86a, 0.9);
      g.fillTriangle(cx - 10, cy, cx - 13, cy - 3.5, cx - 13, cy + 3.5);
      break;
    }
    case "fire": {
      fillCircle(g, cx, cy, 11, 0xff2a00, 0.28);
      fillCircle(g, cx, cy, 8, 0xff5a1f, 0.75);
      fillCircle(g, cx, cy, 5, 0xffc040, 1);
      fillCircle(g, cx - 1, cy - 2, 2.5, 0xfff8c8, 0.95);
      break;
    }
    case "ice": {
      g.lineStyle(2, 0xffffff, 0.85);
      g.fillStyle(color, 0.95);
      g.beginPath();
      g.moveTo(cx, cy - 10);
      g.lineTo(cx + 7, cy);
      g.lineTo(cx, cy + 10);
      g.lineTo(cx - 7, cy);
      g.closePath();
      g.fillPath();
      g.strokePath();
      fillCircle(g, cx, cy, 2.5, 0xffffff, 0.9);
      break;
    }
    case "lightning": {
      g.lineStyle(3, color, 1);
      g.beginPath();
      g.moveTo(cx - 4, cy - 10);
      g.lineTo(cx + 2, cy - 2);
      g.lineTo(cx - 3, cy - 1);
      g.lineTo(cx + 5, cy + 10);
      g.strokePath();
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.beginPath();
      g.moveTo(cx - 4, cy - 10);
      g.lineTo(cx + 2, cy - 2);
      g.lineTo(cx - 3, cy - 1);
      g.lineTo(cx + 5, cy + 10);
      g.strokePath();
      break;
    }
    case "nature": {
      g.lineStyle(1.5, 0x3a6a28, 1);
      g.fillStyle(color, 0.95);
      g.beginPath();
      g.moveTo(cx, cy - 9);
      g.lineTo(cx + 8, cy + 2);
      g.lineTo(cx, cy + 9);
      g.lineTo(cx - 8, cy + 2);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.lineStyle(1, 0xa8e878, 0.6);
      g.lineBetween(cx, cy - 6, cx, cy + 6);
      break;
    }
    case "earth": {
      fillCircle(g, cx, cy, 10, 0x6b4a2a, 0.5);
      fillCircle(g, cx, cy, 8, color, 1);
      fillCircle(g, cx - 3, cy - 2, 2, 0x4a3018, 0.7);
      fillCircle(g, cx + 3, cy + 2, 1.8, 0x4a3018, 0.65);
      fillCircle(g, cx + 1, cy - 3, 1.5, 0x5c3d20, 0.6);
      break;
    }
    case "dark": {
      fillCircle(g, cx, cy, 11, color, 0.25);
      fillCircle(g, cx, cy, 8, 0x4a1570, 0.9);
      fillCircle(g, cx, cy, 5, color, 1);
      fillCircle(g, cx, cy, 2.5, 0x1a0028, 0.85);
      break;
    }
    case "holy": {
      fillCircle(g, cx, cy, 11, 0xfff3b0, 0.35);
      fillCircle(g, cx, cy, 8, 0xfffde8, 0.9);
      fillCircle(g, cx, cy, 5, color, 1);
      fillCircle(g, cx, cy - 1, 2, 0xffffff, 1);
      g.lineStyle(1.5, 0xffd966, 0.7);
      g.strokeCircle(cx, cy, 9);
      break;
    }
    default:
      fillCircle(g, cx, cy, 6, color, 1);
  }
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {string} type
 * @param {number} w
 * @param {number} h
 */
function drawMuzzle(g, type, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const color = towerProjectileColors[type] ?? towerProjectileColors.basic;

  g.lineStyle(2, color, 0.95);
  g.lineBetween(cx - 8, cy, cx + 8, cy);
  g.lineBetween(cx, cy - 8, cx, cy + 8);
  g.lineStyle(1.5, 0xffffff, 0.65);
  g.lineBetween(cx - 5, cy - 5, cx + 5, cy + 5);
  g.lineBetween(cx - 5, cy + 5, cx + 5, cy - 5);
  fillCircle(g, cx, cy, 3, color, 0.85);
  fillCircle(g, cx, cy, 1.5, 0xffffff, 0.9);
}

/**
 * Foreshortened gold ellipse for max-tier base aura.
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} w
 * @param {number} h
 */
function drawMaxTierRing(g, w, h) {
  const gold = 0xf5d742;
  const cx = w / 2;
  const cy = h / 2;
  const rxOuter = w * 0.46;
  const ryOuter = h * 0.42;
  const rxInner = w * 0.34;
  const ryInner = h * 0.3;

  g.fillStyle(gold, 0.18);
  g.fillEllipse(cx, cy, rxOuter * 2, ryOuter * 2);
  g.lineStyle(3, gold, 0.95);
  g.strokeEllipse(cx, cy, rxInner * 2, ryInner * 2);
  g.lineStyle(1.5, 0xffffff, 0.55);
  g.strokeEllipse(cx, cy, rxInner * 1.55, ryInner * 1.55);
}

/**
 * Build procedural projectile, muzzle, and max-tier ring textures once per game boot.
 * @param {Phaser.Scene} scene
 */
export function ensureProjectileFx(scene) {
  if (bootstrapped && scene.textures.exists(getProjectileTextureKey("basic"))) {
    return;
  }
  for (const type of TOWER_TYPES) {
    bakeTexture(scene, getProjectileTextureKey(type), PROJ_SIZE, PROJ_SIZE, (g, w, h) => {
      drawProjectile(g, type, w, h);
    });
    bakeTexture(scene, getMuzzleTextureKey(type), MUZZLE_SIZE, MUZZLE_SIZE, (g, w, h) => {
      drawMuzzle(g, type, w, h);
    });
  }
  bakeTexture(scene, MAX_TIER_RING_KEY, RING_W, RING_H, drawMaxTierRing);
  bootstrapped = true;
}
