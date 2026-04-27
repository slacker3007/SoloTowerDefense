export class CombatSystem {
  constructor(scene, towerSystem, enemySystem) {
    this.scene = scene;
    this.towerSystem = towerSystem;
    this.enemySystem = enemySystem;
    this.projectiles = [];
  }

  update(deltaSeconds, gameState) {
    this.handleTowerAttacks(gameState);
    this.updateProjectiles(deltaSeconds, gameState);
  }

  handleTowerAttacks(gameState) {
    const enemies = this.enemySystem.getActiveEnemies();
    for (const tower of this.towerSystem.towers) {
      if (tower.cooldownRemaining > 0) {
        continue;
      }

      let target = null;
      let bestDistance = Infinity;
      for (const enemy of enemies) {
        const dx = enemy.sprite.x - tower.x;
        const dy = enemy.sprite.y - tower.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= tower.range && distance < bestDistance) {
          bestDistance = distance;
          target = enemy;
        }
      }

      if (target) {
        tower.cooldownRemaining = tower.cooldown;
        const sprite = this.scene.add.circle(tower.x, tower.y, 4, 0xf5d742);
        if (this.scene.worldRoot) {
          this.scene.worldRoot.add(sprite);
        }
        const projectile = {
          x: tower.x,
          y: tower.y,
          speed: 460,
          target,
          damage: tower.damage,
          sprite,
        };
        this.projectiles.push(projectile);
      }
    }
  }

  updateProjectiles(deltaSeconds, gameState) {
    const next = [];
    for (const projectile of this.projectiles) {
      if (!projectile.target.alive || projectile.target.escaped) {
        projectile.sprite.destroy();
        continue;
      }

      const dx = projectile.target.sprite.x - projectile.x;
      const dy = projectile.target.sprite.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const step = projectile.speed * deltaSeconds;

      if (distance <= step + 8) {
        const killed = this.enemySystem.damageEnemy(projectile.target, projectile.damage);
        if (killed) {
          gameState.gold += projectile.target.rewardGold;
        }
        projectile.sprite.destroy();
        continue;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      projectile.x += nx * step;
      projectile.y += ny * step;
      projectile.sprite.x = projectile.x;
      projectile.sprite.y = projectile.y;
      next.push(projectile);
    }

    this.projectiles = next;
  }
}
