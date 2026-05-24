import Phaser from "phaser";
import { SHEEP_IDLE_ANIM_KEY, SHEEP_IDLE_SHEET_KEY, SHEEP_MOVE_ANIM_KEY, SHEEP_MOVE_SHEET_KEY } from "../assets.js";
import { TILE_SIZE } from "../constants.js";
import { cellToWorld, isBuildable } from "../maps/tileRules.js";
import { prefersReducedMotion } from "../settings/accessibilitySettings.js";

const SHEEP_DEPTH = 13;

/**
 * @param {*} map
 * @returns {{ x: number, y: number }[]}
 */
function collectGrassCells(map) {
  const cells = [];
  if (!map?.width || !map?.height) {
    return cells;
  }
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (map.pathMask?.[y]?.[x] === 1) {
        continue;
      }
      const elev = Math.floor(map.elevation?.[y]?.[x] ?? 0);
      if (elev < 2) {
        continue;
      }
      if (!isBuildable(map, x, y)) {
        continue;
      }
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * @param {{ x: number, y: number }} cell
 * @param {*} map
 * @returns {{ x: number, y: number }[]}
 */
function adjacentGrassCells(cell, map) {
  const out = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
      continue;
    }
    if (map.pathMask?.[ny]?.[nx] === 1) {
      continue;
    }
    const elev = Math.floor(map.elevation?.[ny]?.[nx] ?? 0);
    if (elev < 2 || !isBuildable(map, nx, ny)) {
      continue;
    }
    out.push({ x: nx, y: ny });
  }
  return out;
}

export class AmbientSheep {
  /**
   * @param {Phaser.Scene} scene
   * @param {*} map
   * @param {Phaser.GameObjects.Container} parent
   */
  constructor(scene, map, parent) {
    this.scene = scene;
    this.map = map;
    this.parent = parent;
    /** @type {{ sprite: Phaser.GameObjects.Sprite, cell: { x: number, y: number }, state: string, timer: number, target: { x: number, y: number } | null }[]} */
    this.sheep = [];
    if (prefersReducedMotion() || !scene.textures.exists(SHEEP_IDLE_SHEET_KEY)) {
      return;
    }
    const grass = collectGrassCells(map);
    if (grass.length === 0) {
      return;
    }
    Phaser.Utils.Array.Shuffle(grass);
    const picks = grass.slice(0, 2);
    for (const cell of picks) {
      const world = cellToWorld(cell.x, cell.y);
      const spr = scene.add.sprite(world.x, world.y + TILE_SIZE / 2, SHEEP_IDLE_SHEET_KEY, 0);
      spr.setDisplaySize(TILE_SIZE, TILE_SIZE);
      spr.setOrigin(0.5, 1);
      spr.setDepth(SHEEP_DEPTH);
      if (scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
        spr.play(SHEEP_IDLE_ANIM_KEY);
      }
      parent.add(spr);
      this.sheep.push({
        sprite: spr,
        cell,
        state: "idle",
        timer: Phaser.Math.FloatBetween(2, 5),
        target: null,
      });
    }
  }

  /**
   * @param {number} deltaSeconds
   */
  update(deltaSeconds) {
    if (this.sheep.length === 0 || prefersReducedMotion()) {
      return;
    }
    for (const s of this.sheep) {
      if (!s.sprite?.active) {
        continue;
      }
      s.timer -= deltaSeconds;
      if (s.state === "idle") {
        if (s.timer <= 0) {
          const neighbors = adjacentGrassCells(s.cell, this.map);
          if (neighbors.length === 0) {
            s.timer = Phaser.Math.FloatBetween(2, 4);
            continue;
          }
          s.target = Phaser.Utils.Array.GetRandom(neighbors);
          s.state = "walk";
          s.timer = 1.2;
          if (this.scene.anims.exists(SHEEP_MOVE_ANIM_KEY)) {
            s.sprite.play(SHEEP_MOVE_ANIM_KEY);
          }
        }
        continue;
      }
      if (s.state === "walk" && s.target) {
        const dest = cellToWorld(s.target.x, s.target.y);
        const dx = dest.x - s.sprite.x;
        const dy = dest.y + TILE_SIZE / 2 - s.sprite.y;
        const dist = Math.hypot(dx, dy);
        const step = 48 * deltaSeconds;
        if (dist <= step || s.timer <= 0) {
          s.cell = s.target;
          s.target = null;
          s.state = "idle";
          s.timer = Phaser.Math.FloatBetween(3, 6);
          s.sprite.setPosition(dest.x, dest.y + TILE_SIZE / 2);
          if (this.scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
            s.sprite.play(SHEEP_IDLE_ANIM_KEY);
          }
        } else {
          s.sprite.x += (dx / dist) * step;
          s.sprite.y += (dy / dist) * step;
          s.sprite.setFlipX(dx < 0);
        }
      }
    }
  }

  destroy() {
    for (const s of this.sheep) {
      s.sprite?.destroy?.();
    }
    this.sheep = [];
  }
}
