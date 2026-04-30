import { buildDefaultPathMask, computeRouteFromPathMask } from "../maps/enemyPath";
import { ensurePathMaskGrid } from "../maps/mapUtils";
import { cellToWorld, worldToCell } from "../maps/tileRules";
import { createUnitHpBar } from "../ui/UnitHpBar";
import { balanceRules } from "../balance";

const ENEMY_HP_BAR_Y_OFFSET = 52;

export class EnemySystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.map = options.map ?? scene.map ?? null;
    this.pathCells = options.pathCells ?? [];
    this.spawnCell = options.spawnCell ?? this.pathCells[0] ?? { x: 0, y: 0 };
    this.targetCell = options.targetCell ?? this.pathCells[this.pathCells.length - 1] ?? { x: 0, y: 0 };
    this.moveMode = "manual";
    /** @type {{ x: number, y: number }[] | null} */
    this._manualPathCells = null;
    this.enemies = [];
    this._warnedNoPath = false;
    this._warnedBfs = false;
    if (this.map) {
      this.syncFromMap(this.map);
    }
  }

  /**
   * @param {*} map
   */
  syncFromMap(map) {
    this.map = map;
    if (!map?.points) {
      this._manualPathCells = null;
      return;
    }
    this.spawnCell = { x: map.points.enemyBarracks.x, y: map.points.enemyBarracks.y };
    this.targetCell = { x: map.points.homeBarracks.x, y: map.points.homeBarracks.y };
    ensurePathMaskGrid(map);
    if (!map.pathMask) {
      this._manualPathCells = null;
      return;
    }
    const route = computeRouteFromPathMask(map, this.spawnCell, this.targetCell);
    if (route && route.length >= 2) {
      this._manualPathCells = route;
      this._warnedBfs = false;
    } else {
      this._manualPathCells = null;
      if (!this._warnedBfs) {
        this._warnedBfs = true;
        console.warn(
          "No enemy route: paint a continuous path mask (1) from next to red barracks to blue; routing uses only painted cells.",
        );
      }
    }
  }

  spawnEnemy(definition) {
    if (!this._manualPathCells || this._manualPathCells.length < 2) {
      if (!this._warnedNoPath) {
        console.warn("Enemy spawn skipped: no path.");
        this._warnedNoPath = true;
      }
      return null;
    }
    const path = this._manualPathCells.map((c) => ({ x: c.x, y: c.y }));
    const first = path[0];
    const atSpawn = first.x === this.spawnCell.x && first.y === this.spawnCell.y;
    const hasDoorStep = path.length >= 3 && atSpawn && (path[1].x !== this.spawnCell.x || path[1].y !== this.spawnCell.y);
    let startWorld;
    let waypointIndex;
    if (hasDoorStep) {
      startWorld = cellToWorld(path[1].x, path[1].y);
      waypointIndex = 2;
    } else {
      startWorld = cellToWorld(path[0].x, path[0].y);
      waypointIndex = path.length > 1 ? 1 : 0;
    }

    const visual = definition?.visual ?? {};
    const textureKey = typeof visual.textureKey === "string" ? visual.textureKey : "redWarriorRunSheet";
    const animationKey = typeof visual.animationKey === "string" ? visual.animationKey : "red-warrior-run";
    const scale = Number.isFinite(visual.scale) ? visual.scale : 0.5;
    const fallbackTextureKey = "redWarriorRunSheet";
    const fallbackAnimationKey = "red-warrior-run";

    let sprite = null;
    const resolvedTextureKey = this.scene.textures.exists(textureKey)
      ? textureKey
      : this.scene.textures.exists(fallbackTextureKey)
        ? fallbackTextureKey
        : null;
    if (resolvedTextureKey) {
      sprite = this.scene.add.sprite(startWorld.x, startWorld.y, resolvedTextureKey, 0);
      sprite.setScale(scale);
      const resolvedAnimationKey = this.scene.anims.exists(animationKey)
        ? animationKey
        : this.scene.anims.exists(fallbackAnimationKey)
          ? fallbackAnimationKey
          : null;
      if (resolvedAnimationKey) {
        sprite.play(resolvedAnimationKey);
      }
    } else {
      sprite = this.scene.add.circle(startWorld.x, startWorld.y, 14, 0xcf3f3f);
    }

    const tc = path[waypointIndex];
    const enemy = {
      sprite,
      hp: definition.hp,
      maxHp: definition.hp,
      speed: definition.speed,
      baseSpeed: definition.speed,
      rewardGold: definition.rewardGold,
      role: definition.role ?? "normal",
      tags: definition.tags ?? [],
      target: cellToWorld(tc.x, tc.y),
      waypointIndex,
      pathCells: path,
      alive: true,
      escaped: false,
      hpBar: null,
      statuses: [],
      ccWindowTimer: 0,
      ccSecondsWithinWindow: 0,
    };
    this._warnedNoPath = false;

    if (this.scene.worldRoot) {
      this.scene.worldRoot.add(enemy.sprite);
    }
    enemy.hpBar = createUnitHpBar(this.scene, {
      style: "small",
      worldX: startWorld.x,
      worldY: startWorld.y - ENEMY_HP_BAR_Y_OFFSET,
    });
    if (enemy.hpBar) {
      enemy.hpBar.setRatio(1);
    }
    this.enemies.push(enemy);
    return enemy;
  }

  update(deltaSeconds) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.escaped) {
        continue;
      }
      this._tickStatuses(enemy, deltaSeconds);

      const target = enemy.target;
      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const distance = Math.hypot(dx, dy);

      if (distance < enemy.speed * deltaSeconds) {
        enemy.sprite.x = target.x;
        enemy.sprite.y = target.y;
        enemy.hpBar?.setWorldPosition(enemy.sprite.x, enemy.sprite.y - ENEMY_HP_BAR_Y_OFFSET);
        const advanced = this._advanceWaypoint(enemy);
        if (!advanced) {
          enemy.escaped = true;
        }
        continue;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      enemy.sprite.x += nx * enemy.speed * deltaSeconds;
      enemy.sprite.y += ny * enemy.speed * deltaSeconds;
      if (typeof enemy.sprite.setFlipX === "function") {
        enemy.sprite.setFlipX(nx < 0);
      }
      enemy.hpBar?.setWorldPosition(enemy.sprite.x, enemy.sprite.y - ENEMY_HP_BAR_Y_OFFSET);
    }
  }

  damageEnemy(enemy, amount) {
    if (!enemy || !enemy.alive || enemy.escaped) {
      return false;
    }

    enemy.hp -= amount;
    enemy.hpBar?.setRatio(enemy.hp / enemy.maxHp);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.hpBar?.destroy();
      enemy.sprite.destroy();
      return true;
    }

    return false;
  }

  applyStatus(enemy, status) {
    if (!enemy || !enemy.alive || enemy.escaped || !status) {
      return;
    }
    const isCc = status.type === "slow" || status.type === "stun" || status.type === "root";
    if (isCc) {
      const projected = enemy.ccSecondsWithinWindow + (status.duration ?? 0);
      if (projected > balanceRules.ccWindowSeconds * balanceRules.ccUptimeCap) {
        return;
      }
    }
    enemy.statuses.push({
      ...status,
      remaining: status.duration ?? 0,
    });
  }

  consumeEscapedCount() {
    const escaped = this.enemies.filter((enemy) => enemy.escaped && enemy.alive);
    for (const enemy of escaped) {
      enemy.alive = false;
      enemy.hpBar?.destroy();
      enemy.sprite.destroy();
    }
    return escaped.length;
  }

  getActiveEnemies() {
    return this.enemies.filter((enemy) => enemy.alive && !enemy.escaped);
  }

  _tickStatuses(enemy, deltaSeconds) {
    if (!Array.isArray(enemy.statuses) || enemy.statuses.length === 0) {
      enemy.speed = enemy.baseSpeed;
      enemy.ccWindowTimer = Math.max(0, enemy.ccWindowTimer - deltaSeconds);
      return;
    }
    let speedMultiplier = 1;
    let immobilized = false;
    let ccInFrame = false;
    const nextStatuses = [];
    for (const status of enemy.statuses) {
      status.remaining -= deltaSeconds;
      if (status.type === "burn" || status.type === "poison") {
        enemy.hp -= status.dps * deltaSeconds;
      } else if (status.type === "slow") {
        speedMultiplier = Math.min(speedMultiplier, 1 - status.ratio);
        ccInFrame = true;
      } else if (status.type === "stun" || status.type === "root") {
        immobilized = true;
        ccInFrame = true;
      } else if (status.type === "curse" || status.type === "weakening") {
        ccInFrame = true;
      }
      if (status.remaining > 0) {
        nextStatuses.push(status);
      }
    }
    enemy.statuses = nextStatuses;
    enemy.ccWindowTimer += deltaSeconds;
    if (ccInFrame) {
      enemy.ccSecondsWithinWindow += deltaSeconds;
    }
    if (enemy.ccWindowTimer >= 12) {
      enemy.ccWindowTimer = 0;
      enemy.ccSecondsWithinWindow = Math.max(0, enemy.ccSecondsWithinWindow - 12);
    }
    enemy.speed = immobilized ? 0 : enemy.baseSpeed * speedMultiplier;
    enemy.hpBar?.setRatio(enemy.hp / enemy.maxHp);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.hpBar?.destroy();
      enemy.sprite.destroy();
    }
  }

  setBarracksTargets(spawnCell, targetCell) {
    const nx = spawnCell.x;
    const ny = spawnCell.y;
    const tx = targetCell.x;
    const ty = targetCell.y;
    const moved =
      this.spawnCell.x !== nx || this.spawnCell.y !== ny || this.targetCell.x !== tx || this.targetCell.y !== ty;
    this.spawnCell = { x: nx, y: ny };
    this.targetCell = { x: tx, y: ty };
    if (this.map) {
      ensurePathMaskGrid(this.map);
      if (moved) {
        this.map.pathMask = buildDefaultPathMask(this.spawnCell, this.targetCell, this.map.width, this.map.height);
      }
    }
    this.syncFromMap(this.map);
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.escaped) {
        continue;
      }
      this._reapplyManualPathToEnemy(enemy);
    }
  }

  /**
   * @param {*} enemy
   */
  _reapplyManualPathToEnemy(enemy) {
    if (!this._manualPathCells || this._manualPathCells.length < 2) {
      return;
    }
    const path = this._manualPathCells.map((c) => ({ x: c.x, y: c.y }));
    enemy.pathCells = path;
    const cell = worldToCell(enemy.sprite.x, enemy.sprite.y);
    let at = -1;
    for (let i = 0; i < path.length; i += 1) {
      if (path[i].x === cell.x && path[i].y === cell.y) {
        at = i;
      }
    }
    const waypointIndex = at < 0 ? 1 : Math.min(at + 1, path.length - 1);
    enemy.waypointIndex = waypointIndex;
    const tc = path[waypointIndex];
    if (tc) {
      enemy.target = cellToWorld(tc.x, tc.y);
    }
  }

  _advanceWaypoint(enemy) {
    if (!enemy.pathCells) {
      return false;
    }
    const nextIndex = enemy.waypointIndex + 1;
    if (nextIndex >= enemy.pathCells.length) {
      return false;
    }
    enemy.waypointIndex = nextIndex;
    const nextCell = enemy.pathCells[nextIndex];
    enemy.target = cellToWorld(nextCell.x, nextCell.y);
    return true;
  }

  isWalkable(_cellX, _cellY) {
    return true;
  }
}
