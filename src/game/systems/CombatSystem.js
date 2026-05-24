import { balanceRules, clampUtilityBudget, getTowerProjectileColor, toWorldRange, towerCatalog } from "../balance";
import { GAME_EVENT, gameEvents } from "../events";

export class CombatSystem {
  constructor(scene, towerSystem, enemySystem) {
    this.scene = scene;
    this.towerSystem = towerSystem;
    this.enemySystem = enemySystem;
    this.projectiles = [];
    /** @type {{ killStreak: number, bestKillStreak: number, killsThisRun: number, goldEarnedThisRun: number }} */
    this.runStats = { killStreak: 0, bestKillStreak: 0, killsThisRun: 0, goldEarnedThisRun: 0 };
  }

  /**
   * Apply damage and award kill rewards through a single path.
   * @param {object | null} tower
   * @param {object} enemy
   * @param {number} amount
   * @param {{ gold: number }} gameState
   * @param {Record<string, unknown>} [damageOptions]
   * @returns {boolean}
   */
  damageAndReward(tower, enemy, amount, gameState, damageOptions = {}) {
    const killed = this.enemySystem.damageEnemy(enemy, amount, damageOptions);
    if (killed) {
      this.awardKill(enemy, tower, gameState);
    } else if (amount > 0) {
      gameEvents.emit(GAME_EVENT.ENEMY_HIT, { enemy, tower, amount, damageOptions });
    }
    return killed;
  }

  /**
   * @param {object} enemy
   * @param {object | null} tower
   * @param {{ gold: number }} gameState
   */
  awardKill(enemy, tower, gameState) {
    const killGold = this.enemySystem.getKillGold(enemy);
    gameState.gold += killGold;
    this.runStats.killsThisRun += 1;
    this.runStats.killStreak += 1;
    this.runStats.bestKillStreak = Math.max(this.runStats.bestKillStreak, this.runStats.killStreak);
    this.runStats.goldEarnedThisRun += killGold;
    if (tower) {
      for (const effect of tower.effects ?? []) {
        if (effect.type === "bonusGoldPerKill") {
          const bonus = Number.isFinite(effect.amount) ? effect.amount : 0;
          gameState.gold += bonus;
          this.runStats.goldEarnedThisRun += bonus;
        }
      }
      this.handleOnKillEffects(tower, enemy);
    }
    gameEvents.emit(GAME_EVENT.ENEMY_KILLED, { enemy, tower, gold: killGold });
    gameEvents.emit(GAME_EVENT.GOLD_CHANGED, { gold: gameState.gold, delta: killGold });
  }

  update(deltaSeconds, gameState) {
    this.tickColossusStompAuras(deltaSeconds);
    this.updateTowerPulses(deltaSeconds, gameState);
    this.handleTowerAttacks(gameState);
    this.updateProjectiles(deltaSeconds, gameState);
  }

  /** @param {{ type?: string }} tower */
  _fireDamageOpts(tower, extra = {}) {
    return { fireHit: tower?.type === "fire", ...extra };
  }

  tickColossusStompAuras(deltaSeconds) {
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const radTiles = enemy.stompAuraRadiusTiles;
      if (!Number.isFinite(radTiles) || radTiles <= 0) {
        continue;
      }
      enemy.stompAuraAcc = (enemy.stompAuraAcc ?? 0) + deltaSeconds;
      const interval = Math.max(0.35, Number(enemy.stompAuraInterval) || 2.4);
      if (enemy.stompAuraAcc < interval) {
        continue;
      }
      enemy.stompAuraAcc -= interval;
      const radiusWorld = toWorldRange(radTiles);
      for (const tower of this.towerSystem.towers) {
        const d = Math.hypot(tower.x - enemy.sprite.x, tower.y - enemy.sprite.y);
        if (d <= radiusWorld) {
          const cd = Math.max(0.01, Number(tower.cooldown) || 0.5);
          tower.cooldownRemaining = Math.max(tower.cooldownRemaining ?? 0, cd * 0.4);
        }
      }
    }
  }

  /**
   * Holy pulse and similar periodic room damage.
   */
  updateTowerPulses(deltaSeconds, gameState) {
    for (const tower of this.towerSystem.towers) {
      const pulseCfg = (tower.effects ?? []).find((e) => e?.type === "pulseAoE");
      if (!pulseCfg) {
        continue;
      }
      const interval = Math.max(0.35, Number(pulseCfg.interval) || 2);
      tower.pulseAccumulator = (tower.pulseAccumulator ?? 0) + deltaSeconds;
      if (tower.pulseAccumulator < interval) {
        continue;
      }
      tower.pulseAccumulator -= interval;
      const ratio = Number.isFinite(pulseCfg.damageRatio) ? pulseCfg.damageRatio : 0.42;
      const color = getTowerProjectileColor(tower.type);
      for (const enemy of this.enemySystem.getActiveEnemies()) {
        const distance = Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y);
        if (distance > tower.range * this.getTowerRangeMultiplier(tower)) {
          continue;
        }
        const raw = tower.damage * ratio;
        const dmg = this.resolveDamage(tower, enemy, raw);
        this.damageAndReward(tower, enemy, dmg, gameState, this._fireDamageOpts(tower, { aoe: true }));
      }
      this.spawnPulseRingFx(tower.x, tower.y, tower.range * this.getTowerRangeMultiplier(tower), color);
    }
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
        gameEvents.emit(GAME_EVENT.TOWER_FIRE, { tower, target });
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
        this.damageAndReward(
          projectile.tower,
          projectile.target,
          resolvedDamage,
          gameState,
          this._fireDamageOpts(projectile.tower),
        );
        this.applyTowerEffects(projectile.tower, projectile.target, resolvedDamage, gameState);
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
    const tags = enemy.tags ?? [];
    for (const effect of effects) {
      if (effect.type === "bonusVsDark" && tags.includes("dark")) {
        damage *= 1 + effect.ratio;
      }
      if (
        effect.type === "bonusVsHeavy" &&
        (tags.includes("tank") || tags.includes("elite") || tags.includes("armor"))
      ) {
        damage *= 1 + (effect.ratio ?? 0);
      }
      if (
        effect.type === "doubleDamageVsFrozen" &&
        enemy.statuses.some((status) => status.type === "stun" || status.type === "freeze")
      ) {
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
    if (
      tower?.type === "basic" &&
      (enemy.role === "swarm" || tags.includes("swarm")) &&
      Number.isFinite(balanceRules.basicTowerSwarmDamageMultiplier)
    ) {
      damage *= balanceRules.basicTowerSwarmDamageMultiplier;
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
    const splashes = [];
    const chains = [];
    for (const effect of effects) {
      if (effect.type === "splash") {
        splashes.push(effect);
        continue;
      }
      if (effect.type === "chain" || effect.type === "chainNoDecay") {
        chains.push(effect);
        continue;
      }
      if (effect.type === "burn" && !enemy.tags.includes("burnImmune")) {
        this.enemySystem.applyStatus(enemy, {
          type: "burn",
          duration: effect.duration,
          dps: (tower.damage * effect.dpsFactor) / effect.duration,
        });
      } else if (effect.type === "burnStacking" && !enemy.tags.includes("burnImmune")) {
        const d = effect.duration ?? 5;
        const mult = effect.maxStacks ?? 3;
        this.enemySystem.applyStatus(enemy, {
          type: "burn",
          duration: d,
          dps: (tower.damage * 0.34 * mult) / d,
        });
      } else if (effect.type === "poison" && !enemy.tags.includes("poisonImmune")) {
        this.enemySystem.applyStatus(enemy, {
          type: "poison",
          duration: effect.duration,
          dps: (tower.damage * effect.dpsFactor) / effect.duration,
        });
      } else if (effect.type === "slow" && !enemy.tags.includes("slowImmune")) {
        if (enemy.tags.includes("slowResist") && !enemy.tags.includes("slowResistPartial")) {
          /* binary slow resist (e.g. wave-tagged fast) */
        } else {
          this.enemySystem.applyStatus(enemy, { type: "slow", duration: effect.duration, ratio: effect.ratio });
        }
      } else if (effect.type === "stunChance" && Math.random() < (effect.chance ?? 0)) {
        const statusType = effect.asFreeze ? "freeze" : "stun";
        this.enemySystem.applyStatus(enemy, { type: statusType, duration: effect.duration });
      } else if (effect.type === "rootChance" && Math.random() < effect.chance) {
        this.enemySystem.applyStatus(enemy, { type: "root", duration: effect.duration });
      } else if (effect.type === "curse") {
        this.enemySystem.applyStatus(enemy, { type: "curse", duration: effect.duration, ratio: effect.ratio });
      } else if (effect.type === "weakening") {
        this.enemySystem.applyStatus(enemy, { type: "weakening", duration: effect.duration, ratio: effect.ratio });
      } else if (effect.type === "drain") {
        tower.lifestealPool = (tower.lifestealPool ?? 0) + resolvedDamage * effect.ratio;
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
      if (effect.type === "aoeStun") {
        this.applySplashStatus(enemy, "stun", 1.05, { duration: effect.duration ?? 0.8 });
      }
      if (effect.type === "burstAllInRange" && tower.hitCount % 5 === 0) {
        this.applyRangeBurst(tower, resolvedDamage * 0.8, gameState);
      }
      if (effect.type === "volley" || effect.type === "volleyPierce") {
        this.applyVolley(tower, enemy, resolvedDamage, effect.arrows ?? 3, gameState);
      }
      if (effect.type === "smiteBeamTargets") {
        this.applySmiteBeam(tower, enemy, resolvedDamage, effect.targets ?? 3, gameState);
      }
      if (effect.type === "critExplosion" && Math.random() < (effect.chance ?? 0)) {
        this.applySplashDamage(tower, enemy, resolvedDamage * (effect.multiplier ?? 2), 0.42, 1.15, gameState);
      }
    }

    if (splashes.length > 0) {
      const radiusTiles = Math.max(...splashes.map((s) => s.radiusTiles ?? 1.2));
      const ratio = Math.max(...splashes.map((s) => s.ratio ?? 0.5));
      this.applySplashDamage(tower, enemy, resolvedDamage, ratio, radiusTiles, gameState);
      this.spawnSplashRingFx(enemy.sprite.x, enemy.sprite.y, radiusTiles, getTowerProjectileColor(tower.type));
    }
    if (chains.length > 0) {
      const noDecay = chains.some((c) => c.type === "chainNoDecay");
      let maxTargets = 0;
      for (const c of chains) {
        if (c.type === "chain") {
          maxTargets = Math.max(maxTargets, c.targets ?? 2);
        }
        if (c.type === "chainNoDecay") {
          maxTargets = Math.max(maxTargets, balanceRules.maxChainTargets);
        }
      }
      const chained = this.applyChainDamage(tower, enemy, resolvedDamage, noDecay ? 999 : maxTargets, !noDecay, gameState);
      this.spawnChainFx(tower.x, tower.y, enemy, chained, getTowerProjectileColor(tower.type));
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

  applySplashDamage(tower, target, baseDamage, ratio, radiusTiles, gameState) {
    const enemies = this.enemySystem.getActiveEnemies();
    const radius = toWorldRange(radiusTiles);
    for (const enemy of enemies) {
      if (enemy === target) {
        continue;
      }
      const distance = Math.hypot(enemy.sprite.x - target.sprite.x, enemy.sprite.y - target.sprite.y);
      if (distance <= radius) {
        this.damageAndReward(tower, enemy, baseDamage * ratio, gameState, this._fireDamageOpts(tower, { aoe: true }));
      }
    }
  }

  applyChainDamage(tower, target, baseDamage, chainTargets, decay = true, gameState = null) {
    const gs = gameState ?? this.scene?.gameState;
    const safeTargets = Math.min(chainTargets, balanceRules.maxChainTargets);
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => enemy !== target && Math.hypot(enemy.sprite.x - target.sprite.x, enemy.sprite.y - target.sprite.y) <= tower.range)
      .slice(0, safeTargets);
    let ratio = 0.75;
    const hit = [];
    for (const enemy of enemies) {
      const vuln = enemy.tags.includes("linkedPack") ? (enemy.chainVulnerabilityMultiplier ?? 1) : 1;
      if (gs) {
        this.damageAndReward(tower, enemy, baseDamage * (decay ? ratio : 1) * vuln, gs, this._fireDamageOpts(tower, { aoe: true }));
      } else {
        this.enemySystem.damageEnemy(
          enemy,
          baseDamage * (decay ? ratio : 1) * vuln,
          this._fireDamageOpts(tower, { aoe: true }),
        );
      }
      hit.push(enemy);
      if (decay) {
        ratio *= 0.85;
      }
    }
    return hit;
  }

  spawnSplashRingFx(worldX, worldY, radiusTiles, color) {
    const parent = this.scene.effectsWorldLayer ?? this.scene.worldRoot;
    if (!parent) {
      return;
    }
    const gfx = this.scene.add.graphics();
    parent.add(gfx);
    const innerR = 10;
    const targetR = toWorldRange(radiusTiles);
    gfx.lineStyle(3, color, 0.88);
    gfx.strokeCircle(0, 0, innerR);
    gfx.setPosition(worldX, worldY);
    const scale = targetR / innerR;
    this.scene.tweens.add({
      targets: gfx,
      scaleX: scale,
      scaleY: scale,
      alpha: 0,
      duration: 200,
      ease: "Sine.easeOut",
      onComplete: () => gfx.destroy(),
    });
  }

  spawnPulseRingFx(worldX, worldY, radiusWorld, color) {
    const parent = this.scene.effectsWorldLayer ?? this.scene.worldRoot;
    if (!parent) {
      return;
    }
    const gfx = this.scene.add.graphics();
    parent.add(gfx);
    const innerR = Math.max(20, radiusWorld * 0.15);
    gfx.lineStyle(2, color, 0.72);
    gfx.strokeCircle(0, 0, innerR);
    gfx.setPosition(worldX, worldY);
    const scale = radiusWorld / innerR;
    this.scene.tweens.add({
      targets: gfx,
      scaleX: scale,
      scaleY: scale,
      alpha: 0,
      duration: 300,
      ease: "Sine.easeOut",
      onComplete: () => gfx.destroy(),
    });
  }

  spawnChainFx(fromX, fromY, primaryEnemy, chainedEnemies, color) {
    const parent = this.scene.effectsWorldLayer ?? this.scene.worldRoot;
    if (!parent || !primaryEnemy?.sprite) {
      return;
    }
    const gfx = this.scene.add.graphics();
    parent.add(gfx);
    gfx.lineStyle(2.5, color, 0.92);
    gfx.beginPath();
    gfx.moveTo(fromX, fromY);
    gfx.lineTo(primaryEnemy.sprite.x, primaryEnemy.sprite.y);
    for (const e of chainedEnemies) {
      if (e?.sprite) {
        gfx.lineTo(e.sprite.x, e.sprite.y);
      }
    }
    gfx.strokePath();
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 140,
      ease: "Sine.easeOut",
      onComplete: () => gfx.destroy(),
    });
  }

  applyRangeBurst(tower, amount, gameState) {
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y);
      if (distance <= tower.range) {
        this.damageAndReward(tower, enemy, amount, gameState, this._fireDamageOpts(tower, { aoe: true }));
      }
    }
  }

  applyVolley(tower, target, amount, arrows, gameState) {
    const safeArrows = Math.min(arrows, balanceRules.maxVolleyArrows);
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y) <= tower.range)
      .slice(0, safeArrows);
    for (const enemy of enemies) {
      this.damageAndReward(tower, enemy, amount * 0.35, gameState, this._fireDamageOpts(tower, { aoe: true }));
    }
    if (!enemies.includes(target)) {
      this.damageAndReward(tower, target, amount * 0.35, gameState, this._fireDamageOpts(tower, { aoe: true }));
    }
  }

  _tryApplySlowWithResist(enemy, payload) {
    if (enemy.tags.includes("slowImmune")) {
      return;
    }
    if (enemy.tags.includes("slowResist") && !enemy.tags.includes("slowResistPartial")) {
      return;
    }
    this.enemySystem.applyStatus(enemy, { type: "slow", ...payload });
  }

  applySplashStatus(originEnemy, statusType, radiusTiles, payload) {
    const radius = toWorldRange(radiusTiles);
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - originEnemy.sprite.x, enemy.sprite.y - originEnemy.sprite.y);
      if (distance <= radius) {
        if (statusType === "slow") {
          this._tryApplySlowWithResist(enemy, payload);
        } else {
          this.enemySystem.applyStatus(enemy, { type: statusType, ...payload });
        }
      }
    }
  }

  applyAuraStatus(tower, statusType, radiusTiles, payload) {
    const radius = toWorldRange(radiusTiles);
    for (const enemy of this.enemySystem.getActiveEnemies()) {
      const distance = Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y);
      if (distance <= radius) {
        if (statusType === "slow") {
          this._tryApplySlowWithResist(enemy, payload);
        } else {
          this.enemySystem.applyStatus(enemy, { type: statusType, ...payload });
        }
      }
    }
  }

  applySmiteBeam(tower, target, amount, targets, gameState) {
    const safeTargets = Math.max(1, Math.min(targets, balanceRules.maxChainTargets));
    const enemies = this.enemySystem
      .getActiveEnemies()
      .filter((enemy) => Math.hypot(enemy.sprite.x - tower.x, enemy.sprite.y - tower.y) <= tower.range)
      .slice(0, safeTargets);
    for (const enemy of enemies) {
      this.damageAndReward(
        tower,
        enemy,
        enemy === target ? amount * 0.25 : amount * 0.5,
        gameState,
        this._fireDamageOpts(tower, { aoe: true }),
      );
    }
  }
}
