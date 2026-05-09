/**
 * 1D lane survival simulation — balances waves until lives hit 0.
 * Uses src/game/balance.js data; mirrors WaveSystem spawn rules + saturated tower combat.
 */

import { pathToFileURL } from "node:url";
import {
  balanceRules,
  clampUtilityBudget,
  economy,
  getEnemyArchetype,
  getGoldPerKill,
  getTowerTierCost,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getScriptedWave,
  getWaveStep,
  towerCatalog,
  upgrades,
} from "../src/game/balance.js";

const TILE_RANGE_TO_WORLD = 64;
/** Default map BFS route length (cells) × tile size — matches plan */
const LANE_CELLS = 72;
const LANE_LENGTH_PX = LANE_CELLS * TILE_RANGE_TO_WORLD;
/** Saturated model: any enemy on the lane is in range (real tower range < lane length). */
const SATURATED_RANGE = LANE_LENGTH_PX;
const DT = 0.05;
const SEEDS_PER_SCENARIO = 10;
const MAX_SIM_SECONDS = 7200;
const MAX_SIM_STEPS = Math.ceil(MAX_SIM_SECONDS / DT);

/** Extra bank so progression sims can reach T3 on several towers (placement/conversion treated as sunk). */
const DYNAMIC_GOLD_PER_TOWER = 560;

/**
 * Same growth idea as balance-sim `getDynamicSummaryForWave` (unlimited basic): parallel copies scale with wave.
 * @param {number} waveIndex
 */
export function getUnlimitedTowerMultiplier(waveIndex) {
  const w = Math.max(1, Math.floor(waveIndex));
  const step = getWaveStep(w);
  const expected = step?.expectedTowerCount ?? 2;
  return Math.max(20, expected * 12, w * 3);
}

/** Seeded PRNG (mulberry32) */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSpawner(waveIndex, director = { hpScale: 1, speedScale: 1, countOffset: 0 }) {
  const scriptedWave = getScriptedWave(waveIndex);
  const spawnQueue = [];
  for (const pack of scriptedWave?.packs ?? []) {
    const count = Math.max(0, Number(pack?.count) || 0);
    for (let i = 0; i < count; i += 1) {
      spawnQueue.push(buildEnemyDefinitionFromPack(waveIndex, pack, director));
    }
  }
  return {
    interval: Math.max(0.3, Number(scriptedWave?.interval) || (1.25 - waveIndex * 0.02)),
    timer: 0,
    maxAlive: Math.max(4, Number(scriptedWave?.maxAlive) || Math.floor(5 + waveIndex * 0.7)),
    enemyDefinition: spawnQueue[0] ?? buildEnemyDefinitionFromPack(waveIndex, { type: "grunt" }, director),
    waveRole: scriptedWave?.role ?? "normal",
    breather: false,
    totalSpawned: 0,
    spawnTarget: spawnQueue.length,
    spawnQueue,
  };
}

function buildEnemyDefinitionFromPack(waveIndex, pack, director) {
  const archetype = getEnemyArchetype(pack.type ?? "grunt");
  const hp = getWaveBaseHp(waveIndex) * (archetype.hpMultiplier ?? 1) * (pack.hpMultiplier ?? 1) * director.hpScale;
  const speed =
    60 * getWaveBaseSpeed(waveIndex) * (archetype.speedMultiplier ?? 1) * (pack.speedMultiplier ?? 1) * director.speedScale;
  const rewardGold = Math.max(
    1,
    Math.round(getGoldPerKill(waveIndex, false) * (archetype.rewardMultiplier ?? 1) * (pack.rewardMultiplier ?? 1)),
  );
  return {
    hp,
    speed,
    role: archetype.role ?? "normal",
    archetype: pack.type ?? "grunt",
    tags: [...new Set([archetype.role ?? "normal", ...(archetype.tags ?? []), ...(pack.tags ?? [])])],
    rewardGold,
    bonusGoldOnKill: archetype.bonusGoldOnKill ?? 0,
    shieldHp: Number.isFinite(archetype.shieldHpMultiplier) ? hp * archetype.shieldHpMultiplier : 0,
    regenPerSecond: Number.isFinite(archetype.regenPerSecondMultiplier) ? hp * archetype.regenPerSecondMultiplier : 0,
    splitOnDeath: archetype.splitOnDeath ?? null,
    spawnOnThresholds: Array.isArray(archetype.spawnOnThresholds) ? archetype.spawnOnThresholds.map((entry) => ({ ...entry })) : [],
  };
}

function createTower(spec) {
  const { type, upgradeIds = [] } = spec;
  const base = towerCatalog[type] ?? towerCatalog.basic;
  let damage = base.damage;
  let cooldown = 1 / base.rate;
  let rangeTiles = base.rangeTiles;
  let tier = 0;
  const effects = [];

  for (const id of upgradeIds) {
    const u = upgrades[type]?.[id];
    if (!u) continue;
    if (typeof u.damageMultiplier === "number") damage *= u.damageMultiplier;
    if (typeof u.cooldownMultiplier === "number") cooldown *= u.cooldownMultiplier;
    if (typeof u.rangeMultiplier === "number") rangeTiles *= u.rangeMultiplier;
    if (Array.isArray(u.effects)) {
      for (const e of u.effects) effects.push({ ...e });
    }
    if (id === "level1") tier = 1;
    if (id === "level2") tier = 2;
    if (id === "level3") tier = 3;
  }

  const range = rangeTiles * TILE_RANGE_TO_WORLD;
  return {
    type,
    damage,
    cooldown,
    cooldownRemaining: 0,
    range,
    rangeTiles,
    effects,
    hitCount: 0,
    tier,
    upgrades: [...upgradeIds],
    utilityBudget: base.utilityBudget ?? 1,
    lifestealPool: 0,
  };
}

/** Mutate runtime tower with one tier upgrade (level1|2|3). */
function applySingleUpgradeToTower(tower, upgradeId) {
  const u = upgrades[tower.type]?.[upgradeId];
  if (!u || tower.upgrades.includes(upgradeId)) {
    return false;
  }
  if (typeof u.damageMultiplier === "number") tower.damage *= u.damageMultiplier;
  if (typeof u.cooldownMultiplier === "number") tower.cooldown *= u.cooldownMultiplier;
  if (typeof u.rangeMultiplier === "number") {
    tower.rangeTiles *= u.rangeMultiplier;
    tower.range = tower.rangeTiles * TILE_RANGE_TO_WORLD;
  }
  if (Array.isArray(u.effects)) {
    for (const e of u.effects) tower.effects.push({ ...e });
  }
  tower.upgrades.push(upgradeId);
  if (upgradeId === "level1") tower.tier = 1;
  else if (upgradeId === "level2") tower.tier = 2;
  else if (upgradeId === "level3") tower.tier = 3;
  return true;
}

function killGoldFromEnemy(enemy, killerTower) {
  let g = Math.max(0, Number(enemy.rewardGold) || 0) + Math.max(0, Number(enemy.bonusGoldOnKill) || 0);
  if (killerTower?.effects?.length) {
    for (const e of killerTower.effects) {
      if (e?.type === "bonusGoldPerKill" && Number.isFinite(e.amount)) {
        g += e.amount;
      }
    }
  }
  return g;
}

function tryPurchasingUpgrades(gameState, towers) {
  if (!gameState?.dynamicUpgrades || !Array.isArray(towers)) {
    return;
  }
  for (let iter = 0; iter < 2000; iter += 1) {
    let bought = false;
    const sorted = [...towers].sort((a, b) => a.tier - b.tier);
    for (const tower of sorted) {
      if (tower.tier >= 3) continue;
      const nextId = tower.tier === 0 ? "level1" : tower.tier === 1 ? "level2" : "level3";
      const cost = getTowerTierCost(tower.tier + 1, tower.type);
      if (gameState.gold >= cost && applySingleUpgradeToTower(tower, nextId)) {
        gameState.gold -= cost;
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }
}

function getTowerSpeedMultiplierGlobal(towers) {
  let m = 1;
  for (const t of towers) {
    for (const e of t.effects ?? []) {
      if (e.type === "towerAuraSpeed") {
        m = Math.max(m, 1 + (e.ratio ?? 0));
      }
    }
  }
  return m;
}

function getTowerRangeMultiplierGlobal(towers) {
  let m = 1;
  for (const t of towers) {
    for (const e of t.effects ?? []) {
      if (e.type === "towerAuraRange") {
        m = Math.max(m, 1 + (e.ratio ?? 0));
      }
    }
  }
  return m;
}

function effectiveTowerRange(tower, towers) {
  return Math.max(tower.range, SATURATED_RANGE) * getTowerRangeMultiplierGlobal(towers);
}

function getActiveEnemies(enemies) {
  return enemies.filter((e) => e.alive && !e.escaped);
}

/**
 * @param {object | null} killCtx — `{ gameState, killerTower, towers }` when economy progression is enabled
 */
function damageEnemy(enemy, amount, pendingTriggeredSpawns, killCtx = null) {
  if (!enemy?.alive || enemy.escaped) return false;
  let damageMultiplier = enemy.tags.includes("armor") ? 0.85 : 1;
  for (const status of enemy.statuses ?? []) {
    if (status.type === "curse" || status.type === "vulnerability" || status.type === "weakening") {
      damageMultiplier += status.ratio ?? 0;
    }
  }
  let hpDamage = amount * damageMultiplier;
  if (enemy.shieldHp > 0) {
    const absorbed = Math.min(enemy.shieldHp, hpDamage);
    enemy.shieldHp -= absorbed;
    hpDamage -= absorbed;
  }
  enemy.hp -= hpDamage;
  maybeTriggerThresholdSpawns(enemy, pendingTriggeredSpawns);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    if (killCtx?.gameState?.dynamicUpgrades && killCtx.towers) {
      killCtx.gameState.gold += killGoldFromEnemy(enemy, killCtx.killerTower ?? null);
      tryPurchasingUpgrades(killCtx.gameState, killCtx.towers);
    }
    maybeTriggerSplit(enemy, pendingTriggeredSpawns);
    return true;
  }
  return false;
}

function maybeTriggerThresholdSpawns(enemy, pendingTriggeredSpawns) {
  if (!enemy || !Array.isArray(enemy.spawnOnThresholds) || enemy.spawnOnThresholds.length === 0 || enemy.maxHp <= 0) {
    return;
  }
  const hpRatio = enemy.hp / enemy.maxHp;
  for (const entry of enemy.spawnOnThresholds) {
    const threshold = Number(entry?.threshold);
    if (!Number.isFinite(threshold)) {
      continue;
    }
    const key = `${threshold}:${entry.type}:${entry.count}`;
    if (enemy.triggeredThresholds?.has(key)) {
      continue;
    }
    if (hpRatio <= threshold) {
      enemy.triggeredThresholds?.add(key);
      pendingTriggeredSpawns.push({ type: entry.type, count: Number(entry.count) || 0 });
    }
  }
}

function maybeTriggerSplit(enemy, pendingTriggeredSpawns) {
  if (!enemy?.splitOnDeath?.childType) {
    return;
  }
  pendingTriggeredSpawns.push({
    type: enemy.splitOnDeath.childType,
    count: Number(enemy.splitOnDeath.count) || 0,
  });
}

function applyStatus(enemy, status) {
  if (!enemy?.alive || enemy.escaped || !status) return;
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

function tickStatuses(enemy, deltaSeconds, gameState = null, towers = null) {
  if (!Array.isArray(enemy.statuses) || enemy.statuses.length === 0) {
    enemy.speed = enemy.baseSpeed;
    enemy.ccWindowTimer = Math.max(0, enemy.ccWindowTimer - deltaSeconds);
    return;
  }
  if (enemy.regenPerSecond > 0) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenPerSecond * deltaSeconds);
  }
  let speedMultiplier = 1;
  let immobilized = false;
  let ccInFrame = false;
  const nextStatuses = [];
  for (const status of enemy.statuses) {
    status.remaining -= deltaSeconds;
    if (status.type === "burn" || status.type === "poison") {
      const resistMultiplier = status.type === "burn" && enemy.tags.includes("fireResist") ? 0.35 : 1;
      enemy.hp -= status.dps * deltaSeconds * resistMultiplier;
    } else if (status.type === "slow") {
      if (!enemy.tags.includes("slowResist")) {
        speedMultiplier = Math.min(speedMultiplier, 1 - status.ratio);
        ccInFrame = true;
      }
    } else if (status.type === "stun" || status.type === "root") {
      immobilized = true;
      ccInFrame = true;
    } else if (status.type === "weakening") {
      speedMultiplier = Math.min(speedMultiplier, 1 - (status.ratio ?? 0));
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
  if (enemy.ccWindowTimer >= balanceRules.ccWindowSeconds) {
    enemy.ccWindowTimer = 0;
    enemy.ccSecondsWithinWindow = Math.max(0, enemy.ccSecondsWithinWindow - balanceRules.ccWindowSeconds);
  }
  enemy.speed = immobilized ? 0 : enemy.baseSpeed * speedMultiplier;
  if (enemy.hp <= 0) {
    enemy.alive = false;
    if (gameState?.dynamicUpgrades && towers) {
      gameState.gold += killGoldFromEnemy(enemy, null);
      tryPurchasingUpgrades(gameState, towers);
    }
  }
}

function resolveDamage(tower, enemy, baseDamage, rng) {
  let damage = baseDamage;
  const effects = tower.effects ?? [];
  const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);

  for (const effect of effects) {
    if (effect.type === "bonusVsDark" && enemy.tags.includes("dark")) {
      damage *= 1 + effect.ratio;
    }
    if (effect.type === "doubleDamageVsFrozen" && enemy.statuses.some((s) => s.type === "stun")) {
      damage *= 2;
    }
    if (effect.type === "bonusDamageVsRooted" && enemy.statuses.some((s) => s.type === "root")) {
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
    if (effect.type === "crit" && rng() < effect.chance) {
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

function enemiesWithinRadiusOfTarget(active, target, radiusWorld) {
  return active.filter((e) => e !== target && Math.abs(e.progress - target.progress) <= radiusWorld);
}

/**
 * @param {ReturnType<createTower>[]} towers
 * @param {number} seed
 * @param {{ dynamicUpgrades?: boolean, startingGold?: number, unlimitedTowers?: boolean, economyTowerCount?: number }} [options]
 */
export function simulateSurvival(towerSpecs, seed, options = {}) {
  const rng = mulberry32(seed);
  const unlimitedTowers = Boolean(options.unlimitedTowers);
  const economySlots =
    typeof options.economyTowerCount === "number" && Number.isFinite(options.economyTowerCount)
      ? Math.max(0, Math.floor(options.economyTowerCount))
      : towerSpecs.length;
  /** @type {{ type: string, upgradeIds?: string[] }[]} */
  let effectiveSpecs = towerSpecs;
  if (unlimitedTowers && towerSpecs.length > 0) {
    const seen = new Set();
    effectiveSpecs = [];
    for (const s of towerSpecs) {
      const key = `${s.type}:${(s.upgradeIds ?? []).join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        effectiveSpecs.push(s);
      }
    }
  }
  const towers = effectiveSpecs.map((s) => createTower(s));
  /** @type {any[]} */
  const enemies = [];
  let waveIndex = 1;
  let spawner = buildSpawner(waveIndex);
  let nextEnemyId = 1;
  let lives = economy.startingLives;
  let wavesCleared = 0;
  let firstLeakWave = null;
  let totalLeaks = 0;
  let gameOverWave = null;
  let steps = 0;
  const pendingTriggeredSpawns = [];

  const dynamicUpgrades = Boolean(options.dynamicUpgrades);
  const startingGold =
    typeof options.startingGold === "number"
      ? options.startingGold
      : dynamicUpgrades
        ? economy.startingGold + economySlots * DYNAMIC_GOLD_PER_TOWER
        : 0;

  const gameState = {
    lives,
    gold: startingGold,
    dynamicUpgrades,
    unlimitedTowers,
    lastUnlimitedM: getUnlimitedTowerMultiplier(1),
  };
  const speedMulGlobal = getTowerSpeedMultiplierGlobal(towers);

  for (steps = 0; steps < MAX_SIM_STEPS && lives > 0; steps += 1) {
    const dt = DT;

    if (unlimitedTowers && towers.length > 0) {
      const n = towers.length;
      const M = Math.max(getUnlimitedTowerMultiplier(waveIndex), n);
      gameState.lastUnlimitedM = M;
      const base = Math.floor(M / n);
      const rem = M % n;
      for (let ti = 0; ti < n; ti += 1) {
        towers[ti].unlimitedShare = base + (ti < rem ? 1 : 0);
      }
    }

    for (const enemy of enemies) {
      if (!enemy.alive || enemy.escaped) continue;
      tickStatuses(enemy, dt, gameState, towers);
    }

    for (const enemy of enemies) {
      if (!enemy.alive || enemy.escaped) continue;
      if (enemy.speed > 0) {
        enemy.progress += enemy.speed * dt;
      }
      if (enemy.progress >= LANE_LENGTH_PX) {
        enemy.escaped = true;
      }
    }

    // Mirror WaveSystem.update spawn cadence
    spawner.timer += dt;
    if (spawner.timer >= spawner.interval) {
      const activeCount = getActiveEnemies(enemies).length;
      if (activeCount < spawner.maxAlive) {
        if (spawner.totalSpawned >= spawner.spawnTarget && activeCount === 0) {
          wavesCleared += 1;
          waveIndex += 1;
          spawner = buildSpawner(waveIndex);
        } else if (spawner.totalSpawned < spawner.spawnTarget) {
          spawner.timer = 0;
          const def = spawner.spawnQueue?.[spawner.totalSpawned] ?? spawner.enemyDefinition;
          enemies.push({
            id: nextEnemyId++,
            progress: 0,
            hp: def.hp,
            maxHp: def.hp,
            speed: def.speed,
            baseSpeed: def.speed,
            tags: [...def.tags],
            rewardGold: def.rewardGold,
            role: def.role,
            archetype: def.archetype ?? "grunt",
            alive: true,
            escaped: false,
            statuses: [],
            ccWindowTimer: 0,
            ccSecondsWithinWindow: 0,
            shieldHp: Math.max(0, Number(def.shieldHp) || 0),
            maxShieldHp: Math.max(0, Number(def.shieldHp) || 0),
            regenPerSecond: Math.max(0, Number(def.regenPerSecond) || 0),
            splitOnDeath: def.splitOnDeath ?? null,
            spawnOnThresholds: Array.isArray(def.spawnOnThresholds) ? def.spawnOnThresholds.map((entry) => ({ ...entry })) : [],
            triggeredThresholds: new Set(),
            goldBonusOnKill: Math.max(0, Number(def.bonusGoldOnKill) || 0),
          });
          spawner.totalSpawned += 1;
        }
      }
    }

    for (const tower of towers) {
      tower.cooldownRemaining = Math.max(0, tower.cooldownRemaining - dt);
    }

    for (const tower of towers) {
      if (tower.cooldownRemaining > 0) continue;

      const active = getActiveEnemies(enemies);
      if (active.length === 0) continue;

      active.sort((a, b) => b.progress - a.progress);
      const target = active[0];
      tower.hitCount = (tower.hitCount ?? 0) + 1;
      const share = unlimitedTowers ? Math.max(1, tower.unlimitedShare ?? 1) : 1;
      tower.cooldownRemaining = tower.cooldown / (speedMulGlobal * share);

      const hitDamage = resolveDamage(tower, target, tower.damage, rng);
      const killCtx = { gameState, killerTower: tower, towers };
      const killed = damageEnemy(target, hitDamage, pendingTriggeredSpawns, killCtx);
      if (pendingTriggeredSpawns.length > 0) {
        for (const trigger of pendingTriggeredSpawns.splice(0, pendingTriggeredSpawns.length)) {
          const count = Math.max(0, Number(trigger.count) || 0);
          for (let i = 0; i < count; i += 1) {
            spawner.spawnQueue.push(
              buildEnemyDefinitionFromPack(waveIndex, { type: trigger.type }, { hpScale: 1, speedScale: 1, countOffset: 0 }),
            );
          }
        }
        spawner.spawnTarget = spawner.spawnQueue.length;
      }

      applyTowerCombatEffects(tower, target, hitDamage, killed, towers, enemies, rng, gameState, pendingTriggeredSpawns, killCtx);

      lives = gameState.lives;
    }

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const e = enemies[i];
      if (e.escaped && e.alive) {
        e.alive = false;
        lives -= 1;
        gameState.lives = lives;
        totalLeaks += 1;
        if (firstLeakWave === null) firstLeakWave = waveIndex;
        enemies.splice(i, 1);
      } else if (!e.alive) {
        enemies.splice(i, 1);
      }
    }

    if (lives <= 0) {
      gameOverWave = waveIndex;
      break;
    }
  }

  const tierSum = towers.reduce((a, t) => a + (t.tier ?? 0), 0);
  const t3Count = towers.filter((t) => t.tier >= 3).length;

  return {
    wavesCleared,
    gameOverWave: gameOverWave ?? waveIndex,
    firstLeakWave,
    totalLeaks,
    steps,
    survivedCap: lives > 0,
    finalGold: gameState.gold,
    avgTier: towers.length ? tierSum / towers.length : 0,
    t3Count,
    finalUnlimitedMultiplier: unlimitedTowers ? gameState.lastUnlimitedM : null,
    representativeTowerCount: unlimitedTowers ? towers.length : towerSpecs.length,
  };
}

function applyTowerCombatEffects(tower, primary, resolvedDamage, killed, towers, enemies, rng, gameState, pendingTriggeredSpawns, killCtx) {
  const effects = tower.effects ?? [];
  const effRange = effectiveTowerRange(tower, towers);

  for (const effect of effects) {
    if (effect.type === "burn" && !primary.tags.includes("burnImmune")) {
      applyStatus(primary, {
        type: "burn",
        duration: effect.duration,
        dps: (tower.damage * effect.dpsFactor) / Math.max(0.01, effect.duration),
      });
    } else if (effect.type === "poison" && !primary.tags.includes("poisonImmune")) {
      applyStatus(primary, {
        type: "poison",
        duration: effect.duration,
        dps: (tower.damage * effect.dpsFactor) / Math.max(0.01, effect.duration),
      });
    } else if (effect.type === "slow" && !primary.tags.includes("slowResist")) {
      applyStatus(primary, { type: "slow", duration: effect.duration, ratio: effect.ratio });
    } else if (effect.type === "stunChance" && rng() < effect.chance) {
      applyStatus(primary, { type: "stun", duration: effect.duration });
    } else if (effect.type === "rootChance" && rng() < effect.chance) {
      applyStatus(primary, { type: "root", duration: effect.duration });
    } else if (effect.type === "curse") {
      applyStatus(primary, { type: "curse", duration: effect.duration, ratio: effect.ratio });
    } else if (effect.type === "weakening") {
      applyStatus(primary, { type: "weakening", duration: effect.duration, ratio: effect.ratio });
    } else if (effect.type === "drain") {
      const maxLives = economy.startingLives;
      tower.lifestealPool = (tower.lifestealPool ?? 0) + resolvedDamage * effect.ratio;
      gameState.lives = Math.min(maxLives, gameState.lives + resolvedDamage * effect.ratio * 0.01);
    }

    if (effect.type === "auraSlow") {
      for (const e of getActiveEnemies(enemies)) {
        applyStatus(e, { type: "slow", duration: 0.6, ratio: effect.ratio });
      }
    }
    if (effect.type === "auraVulnerability") {
      for (const e of getActiveEnemies(enemies)) {
        applyStatus(e, { type: "vulnerability", duration: 0.8, ratio: effect.ratio });
      }
    }
    if (effect.type === "knockback") {
      applyStatus(primary, { type: "slow", duration: 0.35, ratio: Math.min(0.6, effect.distanceTiles ?? 0.3) });
    }
    if (effect.type === "chainKnockbackSlow") {
      splashSlow(primary, enemies, 1.2, effect.duration, effect.ratio);
    }
    if (effect.type === "splash") {
      const radiusWorld = (effect.radiusTiles ?? 1.2) * TILE_RANGE_TO_WORLD;
      const others = enemiesWithinRadiusOfTarget(getActiveEnemies(enemies), primary, radiusWorld);
      for (const e of others) {
        damageEnemy(e, resolvedDamage * (effect.ratio ?? 0.5), pendingTriggeredSpawns, killCtx);
      }
    }
    if (effect.type === "chain") {
      applyChainDamage(tower, primary, resolvedDamage, effect.targets ?? 2, true, enemies, effRange, pendingTriggeredSpawns, killCtx);
    }
    if (effect.type === "chainNoDecay") {
      applyChainDamage(tower, primary, resolvedDamage, 999, false, enemies, effRange, pendingTriggeredSpawns, killCtx);
    }
    if (effect.type === "burstAllInRange" && tower.hitCount % 5 === 0) {
      for (const e of getActiveEnemies(enemies)) {
        if (Math.abs(e.progress - 0) <= effRange) {
          damageEnemy(e, resolvedDamage * 0.8, pendingTriggeredSpawns, killCtx);
        }
      }
    }
    if (effect.type === "volley" || effect.type === "volleyPierce") {
      const cap = Math.min(effect.arrows ?? 3, balanceRules.maxVolleyArrows);
      const inRange = getActiveEnemies(enemies).filter((e) => Math.abs(e.progress - 0) <= effRange).slice(0, cap);
      for (const e of inRange) {
        damageEnemy(e, resolvedDamage * 0.35, pendingTriggeredSpawns, killCtx);
      }
      if (!inRange.includes(primary)) {
        damageEnemy(primary, resolvedDamage * 0.35, pendingTriggeredSpawns, killCtx);
      }
    }
    if (effect.type === "smiteBeamTargets") {
      const cap = Math.max(1, Math.min(effect.targets ?? 3, balanceRules.maxChainTargets));
      const inRange = getActiveEnemies(enemies).filter((e) => Math.abs(e.progress - 0) <= effRange).slice(0, cap);
      for (const e of inRange) {
        damageEnemy(e, e === primary ? resolvedDamage * 0.25 : resolvedDamage * 0.5, pendingTriggeredSpawns, killCtx);
      }
    }
  }

  if (killed) {
    for (const effect of effects) {
      if (effect.type === "deathExplosionBurn") {
        splashBurn(primary, enemies, 1.2, { duration: 3, dps: tower.damage * 0.25 });
      }
      if (effect.type === "poisonSpreadOnDeath") {
        splashPoison(primary, enemies, 1.3, { duration: 4, dps: tower.damage * 0.2 });
      }
      if (effect.type === "curseSpread") {
        splashCurse(primary, enemies, 1.4, { duration: 3, ratio: 0.15 });
      }
    }
  }
}

function splashSlow(origin, enemies, radiusTiles, duration, ratio) {
  const rw = radiusTiles * TILE_RANGE_TO_WORLD;
  for (const e of getActiveEnemies(enemies)) {
    if (e === origin) continue;
    if (Math.abs(e.progress - origin.progress) <= rw) {
      applyStatus(e, { type: "slow", duration, ratio });
    }
  }
}

function splashBurn(origin, enemies, radiusTiles, payload) {
  const rw = radiusTiles * TILE_RANGE_TO_WORLD;
  for (const e of getActiveEnemies(enemies)) {
    if (e === origin) continue;
    if (Math.abs(e.progress - origin.progress) <= rw) {
      applyStatus(e, { type: "burn", duration: payload.duration, dps: payload.dps });
    }
  }
}

function splashPoison(origin, enemies, radiusTiles, payload) {
  const rw = radiusTiles * TILE_RANGE_TO_WORLD;
  for (const e of getActiveEnemies(enemies)) {
    if (e === origin) continue;
    if (Math.abs(e.progress - origin.progress) <= rw) {
      applyStatus(e, { type: "poison", duration: payload.duration, dps: payload.dps });
    }
  }
}

function splashCurse(origin, enemies, radiusTiles, payload) {
  const rw = radiusTiles * TILE_RANGE_TO_WORLD;
  for (const e of getActiveEnemies(enemies)) {
    if (e === origin) continue;
    if (Math.abs(e.progress - origin.progress) <= rw) {
      applyStatus(e, { type: "curse", duration: payload.duration, ratio: payload.ratio });
    }
  }
}

function applyChainDamage(_tower, primary, baseDamage, chainTargets, decay, enemies, effRange, pendingTriggeredSpawns, killCtx) {
  const safeTargets = Math.min(chainTargets, balanceRules.maxChainTargets);
  const candidates = getActiveEnemies(enemies)
    .filter((e) => e !== primary && Math.abs(e.progress - primary.progress) <= effRange)
    .sort((a, b) => Math.abs(a.progress - primary.progress) - Math.abs(b.progress - primary.progress))
    .slice(0, safeTargets);
  let ratio = 0.75;
  for (const e of candidates) {
    damageEnemy(e, baseDamage * (decay ? ratio : 1), pendingTriggeredSpawns, killCtx);
    if (decay) ratio *= 0.85;
  }
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Scenario definitions: tower specs for createTower */
export const SCENARIOS = [
  { id: "S1", label: "50× basic (no upgrades)", specs: Array.from({ length: 50 }, () => ({ type: "basic", upgradeIds: [] })) },
  ...["archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"].map((el, i) => ({
    id: `S${i + 2}`,
    label: `30× ${el} + T1`,
    specs: Array.from({ length: 30 }, () => ({ type: el, upgradeIds: ["level1"] })),
  })),
  {
    id: "S10",
    label: "Hybrid 25× dark+T1 + 25× lightning+T1 (curse × chain)",
    specs: [
      ...Array.from({ length: 25 }, () => ({ type: "dark", upgradeIds: ["level1"] })),
      ...Array.from({ length: 25 }, () => ({ type: "lightning", upgradeIds: ["level1"] })),
    ],
  },
];

/** Same counts as S2–S9 but tier 0 at start; gold from kills + bank buys T1→T3 when affordable (lowest tier first). */
export const SCENARIOS_PROGRESSION = [
  ...["archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"].map((el, i) => ({
    id: `P${i + 1}`,
    label: `30× ${el} tier0 → spend to T3`,
    specs: Array.from({ length: 30 }, () => ({ type: el, upgradeIds: [] })),
    dynamicUpgrades: true,
  })),
  {
    id: "P9",
    label: "Hybrid 25× dark + 25× lightning tier0 → T3",
    specs: [
      ...Array.from({ length: 25 }, () => ({ type: "dark", upgradeIds: [] })),
      ...Array.from({ length: 25 }, () => ({ type: "lightning", upgradeIds: [] })),
    ],
    dynamicUpgrades: true,
  },
];

/**
 * One representative tower per build; effective parallel count = balance-sim “unlimited” formula each wave.
 * DPS scales as if that many identical copies fired in parallel (cooldown ÷ share per template).
 */
export const SCENARIOS_UNLIMITED = [
  { id: "U1", label: "∞× basic (no upgrades)", specs: [{ type: "basic", upgradeIds: [] }], unlimitedTowers: true },
  ...["archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"].map((el, i) => ({
    id: `U${i + 2}`,
    label: `∞× ${el} + T1`,
    specs: [{ type: el, upgradeIds: ["level1"] }],
    unlimitedTowers: true,
  })),
  {
    id: "U10",
    label: "∞ dark+T1 + ∞ lightning+T1 (2 reps, split M)",
    specs: [
      { type: "dark", upgradeIds: ["level1"] },
      { type: "lightning", upgradeIds: ["level1"] },
    ],
    unlimitedTowers: true,
  },
];

/** ∞ parallel scaling (M per wave) + tier0→T3 purchases; 30-slot economy bank, one combat rep per build. */
export const SCENARIOS_UNLIMITED_PROGRESSION = [
  ...["archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"].map((el, i) => ({
    id: `UP${i + 1}`,
    label: `∞× ${el} tier0→T3 (30-slot gold)`,
    specs: Array.from({ length: 30 }, () => ({ type: el, upgradeIds: [] })),
    unlimitedTowers: true,
    dynamicUpgrades: true,
    economyTowerCount: 30,
  })),
  {
    id: "UP9",
    label: "∞ hybrid 25 dark + 25 lightning tier0→T3 (50-slot gold)",
    specs: [
      ...Array.from({ length: 25 }, () => ({ type: "dark", upgradeIds: [] })),
      ...Array.from({ length: 25 }, () => ({ type: "lightning", upgradeIds: [] })),
    ],
    unlimitedTowers: true,
    dynamicUpgrades: true,
    economyTowerCount: 50,
  },
];

function runScenarioStats(scenario, seeds = SEEDS_PER_SCENARIO) {
  const waves = [];
  const firstLeaks = [];
  const avgTiers = [];
  const t3Counts = [];
  const finalGolds = [];
  const simOptions = {
    dynamicUpgrades: Boolean(scenario.dynamicUpgrades),
    startingGold: scenario.startingGold,
    unlimitedTowers: Boolean(scenario.unlimitedTowers),
    economyTowerCount: scenario.economyTowerCount,
  };
  const finalMults = [];
  const repCounts = [];
  for (let s = 0; s < seeds; s += 1) {
    const seed = scenario.baseSeed + s * 9973;
    const r = simulateSurvival(scenario.specs, seed, simOptions);
    waves.push(r.wavesCleared);
    firstLeaks.push(r.firstLeakWave ?? r.gameOverWave);
    avgTiers.push(r.avgTier ?? 0);
    t3Counts.push(r.t3Count ?? 0);
    finalGolds.push(r.finalGold ?? 0);
    finalMults.push(r.finalUnlimitedMultiplier ?? null);
    repCounts.push(r.representativeTowerCount ?? null);
  }
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    medianWaves: median(waves),
    minWaves: Math.min(...waves),
    maxWaves: Math.max(...waves),
    meanWaves: mean(waves),
    medianFirstLeak: median(firstLeaks.filter((x) => x != null)),
    medianAvgTier: median(avgTiers),
    medianT3Count: median(t3Counts),
    medianFinalGold: median(finalGolds),
    medianFinalUnlimitedM: median(finalMults.filter((x) => x != null)),
    medianReps: median(repCounts.filter((x) => x != null)),
    runs: waves.map((w, i) => ({ seed: scenario.baseSeed + i * 9973, wavesCleared: w, firstLeak: firstLeaks[i] })),
  };
}

function printResults(rows, mode = "default") {
  console.log("\n=== Survival simulation (median / min–max waves cleared, 10 seeds) ===\n");
  if (mode === "progression") {
    console.log(
      "ID     Label                                      med   min–max    mean   leak   avgTier  T3#  endGold",
    );
  } else if (mode === "unlimited") {
    console.log(
      "ID     Label                                      med   min–max    mean   leak   M@end  reps",
    );
  } else if (mode === "unlimited-progression") {
    console.log(
      "ID     Label                                      med   min–max    mean   leak   tier t3R  endGold  M@end  r",
    );
  } else {
    console.log("ID     Label                                      med   min–max    mean   firstLeak(med)");
  }
  for (const r of rows) {
    const lab = r.label.length > 40 ? `${r.label.slice(0, 37)}...` : r.label.padEnd(40);
    const mfl = Number.isFinite(r.medianFirstLeak) ? r.medianFirstLeak.toFixed(1) : String(r.medianFirstLeak);
    if (mode === "progression") {
      const at = Number.isFinite(r.medianAvgTier) ? r.medianAvgTier.toFixed(2) : "?";
      const t3 = String(r.medianT3Count ?? "");
      const fg = Number.isFinite(r.medianFinalGold) ? Math.round(r.medianFinalGold) : "?";
      console.log(
        `${r.scenarioId.padEnd(6)} ${lab} ${String(r.medianWaves).padStart(5)}   ${r.minWaves}-${r.maxWaves}      ${r.meanWaves.toFixed(1).padStart(5)}   ${mfl.padStart(6)}   ${at.padStart(7)}  ${t3.padStart(3)}  ${String(fg).padStart(7)}`,
      );
    } else if (mode === "unlimited") {
      const mm = Number.isFinite(r.medianFinalUnlimitedM) ? String(Math.round(r.medianFinalUnlimitedM)) : "?";
      const rp = r.medianReps != null ? String(r.medianReps) : "?";
      console.log(
        `${r.scenarioId.padEnd(6)} ${lab} ${String(r.medianWaves).padStart(5)}   ${r.minWaves}-${r.maxWaves}      ${r.meanWaves.toFixed(1).padStart(5)}   ${mfl.padStart(6)}   ${mm.padStart(6)}  ${rp.padStart(5)}`,
      );
    } else if (mode === "unlimited-progression") {
      const at = Number.isFinite(r.medianAvgTier) ? r.medianAvgTier.toFixed(2) : "?";
      const t3 = String(r.medianT3Count ?? "");
      const fg = Number.isFinite(r.medianFinalGold) ? Math.round(r.medianFinalGold) : "?";
      const mm = Number.isFinite(r.medianFinalUnlimitedM) ? String(Math.round(r.medianFinalUnlimitedM)) : "?";
      const rp = r.medianReps != null ? String(r.medianReps) : "?";
      console.log(
        `${r.scenarioId.padEnd(6)} ${lab} ${String(r.medianWaves).padStart(5)}   ${r.minWaves}-${r.maxWaves}      ${r.meanWaves.toFixed(1).padStart(5)}   ${mfl.padStart(6)}   ${at.padStart(4)}  ${t3.padStart(3)}  ${String(fg).padStart(7)}  ${mm.padStart(6)}  ${rp}`,
      );
    } else {
      console.log(
        `${r.scenarioId.padEnd(6)} ${lab} ${String(r.medianWaves).padStart(5)}   ${r.minWaves}-${r.maxWaves}      ${r.meanWaves.toFixed(1).padStart(5)}   ${mfl.padStart(6)}`,
      );
    }
  }
}

const BASE_SEED = 0xfeed2025;

function main() {
  const progression = process.argv.includes("--progression");
  const unlimited = process.argv.includes("--unlimited");

  let list = SCENARIOS;
  let printMode = "default";
  if (unlimited && progression) {
    list = SCENARIOS_UNLIMITED_PROGRESSION;
    printMode = "unlimited-progression";
  } else if (unlimited) {
    list = SCENARIOS_UNLIMITED;
    printMode = "unlimited";
  } else if (progression) {
    list = SCENARIOS_PROGRESSION;
    printMode = "progression";
  }

  const rows = [];
  for (const sc of list) {
    if (sc.id === "S10" && (!sc.specs || sc.specs.length === 0)) {
      console.warn("Skipping S10 — specs empty. Set SCENARIOS S10 specs after tuning.");
      continue;
    }
    rows.push(runScenarioStats({ ...sc, baseSeed: BASE_SEED }, SEEDS_PER_SCENARIO));
  }

  if (printMode === "progression") {
    console.log(
      `\nProgression mode: starting gold = economy.startingGold + towers×${DYNAMIC_GOLD_PER_TOWER} (placement/conversion bank); kills add gold; auto-buy cheapest next tier on lowest-tier towers until broke or all T3.\n`,
    );
    printResults(rows, "progression");
  } else if (printMode === "unlimited") {
    console.log(
      "\nUnlimited mode: parallel copy count M(wave) = max(20, expectedTowerCount×12, wave×3) from waveProgram (same spirit as balance-sim unlimited basic). One sim tower per unique build; cooldown ÷ (M split across reps).\n",
    );
    printResults(rows, "unlimited");
  } else if (printMode === "unlimited-progression") {
    console.log(
      `\nUnlimited + progression: M(wave) parallel scaling; one combat rep per unique build; bank = economy.startingGold + economyTowerCount×${DYNAMIC_GOLD_PER_TOWER} (30 or 50 slots); kills add gold; auto-buy T1→T3. Columns: t3R = reps at tier 3 (not slot count), r = sim reps.\n`,
    );
    printResults(rows, "unlimited-progression");
  } else {
    printResults(rows, "default");
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
