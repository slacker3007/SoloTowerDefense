import { buildDefaultPathMask, computeRouteFromPathMask } from "../maps/enemyPath";
import { ensurePathMaskGrid } from "../maps/mapUtils";
import { cellToWorld, worldToCell } from "../maps/tileRules";

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

    let sprite = null;
    if (this.scene.textures.exists("redWarriorRunSheet")) {
      sprite = this.scene.add.sprite(startWorld.x, startWorld.y, "redWarriorRunSheet", 0);
      sprite.setScale(0.5);
      if (this.scene.anims.exists("red-warrior-run")) {
        sprite.play("red-warrior-run");
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
      rewardGold: definition.rewardGold,
      target: cellToWorld(tc.x, tc.y),
      waypointIndex,
      pathCells: path,
      alive: true,
      escaped: false,
    };
    this._warnedNoPath = false;

    if (this.scene.worldRoot) {
      this.scene.worldRoot.add(enemy.sprite);
    }
    this.enemies.push(enemy);
    return enemy;
  }

  update(deltaSeconds) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.escaped) {
        continue;
      }

      const target = enemy.target;
      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const distance = Math.hypot(dx, dy);

      if (distance < enemy.speed * deltaSeconds) {
        enemy.sprite.x = target.x;
        enemy.sprite.y = target.y;
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
    }
  }

  damageEnemy(enemy, amount) {
    if (!enemy || !enemy.alive || enemy.escaped) {
      return false;
    }

    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.sprite.destroy();
      return true;
    }

    return false;
  }

  consumeEscapedCount() {
    const escaped = this.enemies.filter((enemy) => enemy.escaped && enemy.alive);
    for (const enemy of escaped) {
      enemy.alive = false;
      enemy.sprite.destroy();
    }
    return escaped.length;
  }

  getActiveEnemies() {
    return this.enemies.filter((enemy) => enemy.alive && !enemy.escaped);
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
