import { balanceRules, clampUtilityBudget, economy, getTowerProjectileColor, toWorldRange, towerCatalog } from "../balance";

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
      const effectiveRange = tower.range * this.getTowerRangeMultiplier(tower);
      for (const enemy of enemies) {
        const dx = enemy.sprite.x - tower.x;
        const dy = enemy.sprite.y - tower.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= effectiveRange && distance < bestDistance) {
          bestDistance = distance;
          target = enemy;
        }
      }

      if (target) {
        tower.hitCount = (tower.hitCount ?? 0) + 1;
        tower.cooldownRemaining = tower.cooldown / this.getTowerSpeedMultiplier(tower);
        const projectileColor = getTowerProjectileColor(tower.type);
        const sprite = this.scene.add.circle(tower.x, tower.y, 4, projectileColor);
        sprite.setStrokeStyle(1.5, 0xffffff, 0.5);
        const effectsParent = this.scene.effectsWorldLayer ?? this.scene.worldRoot;
        if (effectsParent) {
          effectsParent.add(sprite);
        }
        const projectile = {
          x: tower.x,
          y: tower.y,
          speed: tower.projectileSpeed ?? towerCatalog[tower.type]?.projectileSpeed ?? towerCatalog.basic.projectileSpeed,
          target,
          damage: tower.damage,
          sprite,
          tower,
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
        const resolvedDamage = this.resolveDamage(projectile.tower, projectile.target, projectile.damage);
        const killed = this.enemySystem.damageEnemy(projectile.target, resolvedDamage);
        this.applyTowerEffects(projectile.tower, projectile.target, resolvedDamage, gameState);
        if (killed) {
          gameState.gold += projectile.target.rewardGold;
          this.handleOnKillEffects(projectile.tower, projectile.target);
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

  resolveDamage(tower, enemy, baseDamage) {
    let damage = baseDamage;
    const effects = tower.effects ?? [];
    const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);
    for (const effect of effects) {
      if (effect.type === "bonusVsDark" && enemy.tags.includes("dark")) {
        damage *= 1 + effect.ratio;
      }
      if (effect.type === "doubleDamageVsFrozen" && enemy.statuses.some((status) => status.type === "stun")) {
        damage *= 2;
      }
      if (effect.type === "bonusDamageVsRooted" && enemy.statuses.some((status) => status.type === "root")) {
        damage *= 1 + effect.ratio;
      }
      if (effect.type === "headshotThreshold" && hpRatio <= effect.hpThreshold) {
        damage = enemy.hp;
      }
      if (effect.type === "burstEveryHits" && tower.hitCount % effect.every === 0) {
        damage *= effect.multiplier;
      }
      if (effect.type === "trueDamageEveryHits" && tower.hitCount % effect.every === 0) {
        damage += enemy.maxHp * 0.08;
      }
      if (effect.type === "crit" && Math.random() < effect.chance) {
        damage *= effect.multiplier;
      }
    }
    const cooldown = Math.max(0.01, tower.cooldown ?? 0.5);
    const utilityBudget = tower.utilityBudget ?? 1;
    if (utilityBudget < 1) {
      damage = clampUtilityBudget(tower.type, damage, cooldown);
    }
    return damage;
  }

  getTowerSpeedMultiplier(targetTower) {
    let multiplier = 1;
    for (const sourceTower of this.towerSystem.towers) {
      for (const effect of sourceTower.effects ?? []) {
        if (effect.type !== "towerAuraSpeed") {
          continue;
        }
        const distance = Math.hypot(targetTower.x - sourceTower.x, targetTower.y - sourceTower.y);
        if (distance <= toWorldRange(effect.radiusTiles ?? 2.5)) {
          multiplier = Math.max(multiplier, 1 + (effect.ratio ?? 0));
        }
      }
    }
    return multiplier;
  }

  getTowerRangeMultiplier(targetTower) {
    let multiplier = 1;
    for (const sourceTower of this.towerSystem.towers) {
      for (const effect of sourceTower.effects ?? []) {
        if (effect.type !== "towerAuraRange") {
          continue;
        }
        const distance = Math.hypot(targetTower.x - sourceTower.x, targetTower.y - sourceTower.y);
        if (distance <= sourceTower.range) {
          multiplier = Math.max(multiplier, 1 + (effect.ratio ?? 0));
        }
      }
    }
    return multiplier;
  }

  applyTowerEffects(tower, enemy, resolvedDamage, gameState) {
    const effects = tower.effects ?? [];
    for (const effect of effects) {
      if (effect.type === "burn" && !enemy.tags.includes("burnImmune")) {
        this.enemySystem.applyStatus(enemy, { type: "burn", duration: effect.duration, dps: (tower.damage * effect.dpsFactor) / effect.duration });
      } else if (effect.type === "poison" && !enemy.tags.includes("poisonImmune")) {
        this.enemySystem.applyStatus(enemy, { type: "poison", duration: effect.duration, dps: (tower.damage * effect.dpsFactor) / effect.duration });
      } else if (effect.type === "slow" && !enemy.tags.includes("slowResist")) {
        this.enemySystem.applyStatus(enemy, { type: "slow", duration: effect.duration, ratio: effect.ratio });
      } else if (effect.type === "stunChance" && Math.random() < effect.chance) {
        this.enemySystem.applyStatus(enemy, { type: "stun", duration: effect.duration });
      } else if (effect.type === "rootChance" && Math.random() < effect.chance) {
        this.enemySystem.applyStatus(enemy, { type: "root", duration: effect.duration });
      } else if (effect.type === "curse") {
        this.enemySystem.applyStatus(enemy, { type: "curse", duration: effect.duration, ratio: effect.ratio });
      } else if (effect.type === "weakening") {
        this.enemySystem.applyStatus(enemy, { type: "weakening", duration: effect.duration, ratio: effect.ratio });
      } else if (effect.type === "drain") {
        const maxLives = effects.some((entry) => entry.type === "overhealShield")
          ? Math.ceil(economy.startingLives * 1.25)
          : economy.startingLives;
        tower.lifestealPool = (tower.lifestealPool ?? 0) + resolvedDamage * effect.ratio;
        gameState.lives = Math.min(maxLives, gameState.lives + resolvedDamage * effect.ratio * 0.01);
      }
      if (effect.type === "auraSlow") {
        this.applyAuraStatus(tower, "slow", effect.radiusTiles ?? 2.5, {
          duration: 0.6,
          ratio: effect.ratio,
        });
      }
      if (effect.type === "auraVulnerability") {
        this.applyAuraStatus(tower, "vulnerability", effect.radiusTiles ?? 2.5, {
          duration: 0.8,
          ratio: effect.ratio,
        });
      }
      if (effect.type === "knockback") {
        this.enemySystem.applyStatus(enemy, { type: "slow", duration: 0.35, ratio: Math.min(0.6, effect.distanceTiles ?? 0.3) });
      }
      if (effect.type === "chainKnockbackSlow") {
        this.applySplashStatus(enemy, "slow", 1.2, { duration: effect.duration, ratio: effect.ratio });
      }
      if (effect.type === "splash") {
        this.applySplashDamage(tower, enemy, resolvedDamage, effect.ratio, effect.radiusTiles ?? 1.2);
      }
      if (effect.type === "chain") {
        this.applyChainDamage(tower, enemy, resolvedDamage, effect.targets ?? 2, true);
      }
      if (effect.type === "chainNoDecay") {
        this.applyChainDamage(tower, enemy, resolvedDamage, 999, false);
      }
      if (effect.type === "burstAllInRange" && tower.hitCount % 5 === 0) {
        this.applyRangeBurst(tower, resolvedDamage * 0.8);
      }
      if (effect.type === "volley" || effect.type === "volleyPierce") {
        this.applyVolley(tower, enemy, resolvedDamage, effect.arrows ?? 3);
      }
      if (effect.type === "smiteBeamTargets") {
        this.applySmiteBeam(tower, enemy, resolvedDamage, effect.targets ?? 3);
      }
    }
  }

  handleOnKillEffects(tower, enemy) {
    const effects = tower.effects ?? [];
    for (const effect of effects) {
      if (effect.type === "deathExplosionBurn") {
        this.applySplashStatus(enemy, "burn", 1.2, { duration: 3, dps: tower.damage * 0.25 });
      }
      if (effect.type === "poisonSpreadOnDeath") {
        this.applySplashStatus(enemy, "poison", 1.3, { duration: 4, dps: tower.damage * 0.2 });
      }
      if (effect.type === "curseSpread") {
        this.applySplashStatus(enemy, "curse", 1.4, { duration: 3, ratio: 0.15 });
      }
    }
  }

  applySplashDamage(tower, target, baseDamage, ratio, radiusTiles) {
    const enemies = this.enemySystem.getActiveEnemies();
    const radius = toWorldRange(radiusTiles);
    for (const enemy of enemies) {
      if (enemy === target) {
        continue;
      }
      const distance = Math.hypot(enemy.sprite.x - target.sprite.x, enemy.sprite.y - target.sprite.y);
      if (distance <= radius) {
        this.enemySystem.damageEnemy(enemy, baseDamage * ratio);
      }
    }
  }

  applyChainDamage(tower, target, baseDamage, chainTargets, decay = true) {
    const safeTargets = Math.min(chainTargets, balanceRules.maxChainTargets);
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => enemy !== target && Math.hypot(enemy.sprite.x - target.sprite.x, enemy.sprite.y - target.sprite.y) <= tower.range)
      .slice(0, safeTargets);
    let ratio = 0.75;
    for (const enemy of enemies) {
      this.enemySystem.damageEnemy(enemy, baseDamage * (decay ? ratio : 1));
      if (decay) {
        ratio *= 0.85;
      }
    }
  }

  applyRangeBurst(tower, amount) {
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y);
      if (distance <= tower.range) {
        this.enemySystem.damageEnemy(enemy, amount);
      }
    }
  }

  applyVolley(tower, target, amount, arrows) {
    const safeArrows = Math.min(arrows, balanceRules.maxVolleyArrows);
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y) <= tower.range)
      .slice(0, safeArrows);
    for (const enemy of enemies) {
      this.enemySystem.damageEnemy(enemy, amount * 0.35);
    }
    if (!enemies.includes(target)) {
      this.enemySystem.damageEnemy(target, amount * 0.35);
    }
  }

  applySplashStatus(originEnemy, statusType, radiusTiles, payload) {
    const radius = toWorldRange(radiusTiles);
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - originEnemy.sprite.x, enemy.sprite.y - originEnemy.sprite.y);
      if (distance <= radius) {
        this.enemySystem.applyStatus(enemy, { type: statusType, ...payload });
      }
    }
  }

  applyAuraStatus(tower, statusType, radiusTiles, payload) {
    const radius = toWorldRange(radiusTiles);
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y);
      if (distance <= radius) {
        this.enemySystem.applyStatus(enemy, { type: statusType, ...payload });
      }
    }
  }

  applySmiteBeam(tower, target, amount, targets) {
    const safeTargets = Math.max(1, Math.min(targets, balanceRules.maxChainTargets));
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y) <= tower.range)
      .slice(0, safeTargets);
    for (const enemy of enemies) {
      this.enemySystem.damageEnemy(enemy, enemy === target ? amount * 0.25 : amount * 0.5);
    }
  }
}
