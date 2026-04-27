import { cellToWorld } from "../maps/tileRules";

export class EnemySystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.pathCells = options.pathCells ?? [];
    this.spawnCell = options.spawnCell ?? this.pathCells[0] ?? { x: 0, y: 0 };
    this.targetCell = options.targetCell ?? this.pathCells[this.pathCells.length - 1] ?? { x: 0, y: 0 };
    this.moveMode = options.moveMode ?? "direct";
    this.enemies = [];
  }

  spawnEnemy(definition) {
    const start = cellToWorld(this.spawnCell.x, this.spawnCell.y);
    const target = cellToWorld(this.targetCell.x, this.targetCell.y);
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
      target,
      waypointIndex: 1,
      alive: true,
      escaped: false,
    };

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
        enemy.escaped = true;
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
  }
}
