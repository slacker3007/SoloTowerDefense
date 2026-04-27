import { cellToWorld, worldToCell } from "../maps/tileRules";
import { findGridPath } from "./pathfinding";

export class EnemySystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.map = options.map ?? scene.map ?? null;
    this.pathCells = options.pathCells ?? [];
    this.spawnCell = options.spawnCell ?? this.pathCells[0] ?? { x: 0, y: 0 };
    this.targetCell = options.targetCell ?? this.pathCells[this.pathCells.length - 1] ?? { x: 0, y: 0 };
    this.moveMode = options.moveMode ?? "pathfinding";
    this.enemies = [];
    this._warnedNoPath = false;
  }

  spawnEnemy(definition) {
    const start = cellToWorld(this.spawnCell.x, this.spawnCell.y);
    let sprite = null;
    if (this.scene.textures.exists("redWarriorRunSheet")) {
      sprite = this.scene.add.sprite(start.x, start.y, "redWarriorRunSheet", 0);
      sprite.setScale(0.5);
      if (this.scene.anims.exists("red-warrior-run")) {
        sprite.play("red-warrior-run");
      }
    } else {
      sprite = this.scene.add.circle(start.x, start.y, 14, 0xcf3f3f);
    }

    const enemy = {
      sprite,
      hp: definition.hp,
      maxHp: definition.hp,
      speed: definition.speed,
      rewardGold: definition.rewardGold,
      target: cellToWorld(this.targetCell.x, this.targetCell.y),
      waypointIndex: 0,
      pathCells: null,
      alive: true,
      escaped: false,
    };

    if (this.moveMode === "pathfinding") {
      const hasPath = this._assignPathFromCell(enemy, this.spawnCell);
      if (!hasPath) {
        enemy.sprite.destroy();
        if (!this._warnedNoPath) {
          console.warn("Enemy spawn skipped: no walkable path from enemy barracks to home barracks.");
          this._warnedNoPath = true;
        }
        return null;
      }
      this._warnedNoPath = false;
    }

    this.enemies.push(enemy);
    return enemy;
  }

  update(deltaSeconds) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.escaped) {
        continue;
      }

      if (this.moveMode === "pathfinding" && this._isCurrentWaypointBlocked(enemy)) {
        const repathed = this._assignPathFromCell(enemy, worldToCell(enemy.sprite.x, enemy.sprite.y));
        if (!repathed) {
          continue;
        }
      }

      const target = enemy.target;
      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const distance = Math.hypot(dx, dy);

      if (distance < enemy.speed * deltaSeconds) {
        enemy.sprite.x = target.x;
        enemy.sprite.y = target.y;
        if (this.moveMode === "pathfinding") {
          const advanced = this._advanceWaypoint(enemy);
          if (!advanced) {
            enemy.escaped = true;
          }
        } else {
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

  /**
   * @param {{ x: number, y: number }} spawnCell enemy barracks
   * @param {{ x: number, y: number }} targetCell home / blue barracks
   */
  setBarracksTargets(spawnCell, targetCell) {
    this.spawnCell = { x: spawnCell.x, y: spawnCell.y };
    this.targetCell = { x: targetCell.x, y: targetCell.y };
    if (this.moveMode === "pathfinding") {
      this.repathActiveEnemies();
    }
  }

  repathActiveEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.escaped) {
        continue;
      }
      this._assignPathFromCell(enemy, worldToCell(enemy.sprite.x, enemy.sprite.y));
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

  _assignPathFromCell(enemy, startCell) {
    if (!this.map) {
      return false;
    }
    const path = findGridPath(startCell, this.targetCell, (cellX, cellY) => this._isCellWalkable(cellX, cellY), {
      width: this.map.width,
      height: this.map.height,
    });
    if (!path || path.length === 0) {
      return false;
    }

    enemy.pathCells = path;
    enemy.waypointIndex = path.length > 1 ? 1 : 0;
    const targetCell = path[enemy.waypointIndex];
    enemy.target = cellToWorld(targetCell.x, targetCell.y);
    return true;
  }

  _isCurrentWaypointBlocked(enemy) {
    if (!enemy.pathCells || enemy.waypointIndex >= enemy.pathCells.length) {
      return false;
    }
    const nextCell = enemy.pathCells[enemy.waypointIndex];
    return !this._isCellWalkable(nextCell.x, nextCell.y);
  }

  _isCellWalkable(cellX, cellY) {
    if (!this.map) {
      return false;
    }
    const row = this.map.elevation[cellY];
    if (!row || row[cellX] == null || row[cellX] < 1) {
      return false;
    }

    const isSpawn = cellX === this.spawnCell.x && cellY === this.spawnCell.y;
    const isGoal = cellX === this.targetCell.x && cellY === this.targetCell.y;
    if (!isSpawn && !isGoal && this.map.buildings[cellY]?.[cellX] != null) {
      return false;
    }

    const towerKey = `${cellX},${cellY}`;
    const towerCells = this.scene.towerSystem?.cellOccupancy;
    if (!isSpawn && !isGoal && towerCells instanceof Set && towerCells.has(towerKey)) {
      return false;
    }

    return true;
  }
}
