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
  getWaveBaseHp,
  getWaveBaseSpeed,
  getScriptedWave,
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

function damageEnemy(enemy, amount, pendingTriggeredSpawns) {
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

function tickStatuses(enemy, deltaSeconds) {
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
 */
export function simulateSurvival(towerSpecs, seed) {
  const rng = mulberry32(seed);
  const towers = towerSpecs.map((s) => createTower(s));
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

  const gameState = { lives };
  const speedMulGlobal = getTowerSpeedMultiplierGlobal(towers);

  for (steps = 0; steps < MAX_SIM_STEPS && lives > 0; steps += 1) {
    const dt = DT;

    for (const enemy of enemies) {
      if (!enemy.alive || enemy.escaped) continue;
      tickStatuses(enemy, dt);
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
      tower.cooldownRemaining = tower.cooldown / speedMulGlobal;

      const hitDamage = resolveDamage(tower, target, tower.damage, rng);
      const killed = damageEnemy(target, hitDamage, pendingTriggeredSpawns);
    if (pendingTriggeredSpawns.length > 0) {
      for (const trigger of pendingTriggeredSpawns.splice(0, pendingTriggeredSpawns.length)) {
        const count = Math.max(0, Number(trigger.count) || 0);
        for (let i = 0; i < count; i += 1) {
          spawner.spawnQueue.push(buildEnemyDefinitionFromPack(waveIndex, { type: trigger.type }, { hpScale: 1, speedScale: 1, countOffset: 0 }));
        }
      }
      spawner.spawnTarget = spawner.spawnQueue.length;
    }


      applyTowerCombatEffects(tower, target, hitDamage, killed, towers, enemies, rng, gameState, pendingTriggeredSpawns);

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

  return {
    wavesCleared,
    gameOverWave: gameOverWave ?? waveIndex,
    firstLeakWave,
    totalLeaks,
    steps,
    survivedCap: lives > 0,
  };
}

function applyTowerCombatEffects(tower, primary, resolvedDamage, killed, towers, enemies, rng, gameState, pendingTriggeredSpawns) {
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
        damageEnemy(e, resolvedDamage * (effect.ratio ?? 0.5), pendingTriggeredSpawns);
      }
    }
    if (effect.type === "chain") {
      applyChainDamage(tower, primary, resolvedDamage, effect.targets ?? 2, true, enemies, effRange, pendingTriggeredSpawns);
    }
    if (effect.type === "chainNoDecay") {
      applyChainDamage(tower, primary, resolvedDamage, 999, false, enemies, effRange, pendingTriggeredSpawns);
    }
    if (effect.type === "burstAllInRange" && tower.hitCount % 5 === 0) {
      for (const e of getActiveEnemies(enemies)) {
        if (Math.abs(e.progress - 0) <= effRange) {
          damageEnemy(e, resolvedDamage * 0.8, pendingTriggeredSpawns);
        }
      }
    }
    if (effect.type === "volley" || effect.type === "volleyPierce") {
      const cap = Math.min(effect.arrows ?? 3, balanceRules.maxVolleyArrows);
      const inRange = getActiveEnemies(enemies).filter((e) => Math.abs(e.progress - 0) <= effRange).slice(0, cap);
      for (const e of inRange) {
        damageEnemy(e, resolvedDamage * 0.35, pendingTriggeredSpawns);
      }
      if (!inRange.includes(primary)) {
        damageEnemy(primary, resolvedDamage * 0.35, pendingTriggeredSpawns);
      }
    }
    if (effect.type === "smiteBeamTargets") {
      const cap = Math.max(1, Math.min(effect.targets ?? 3, balanceRules.maxChainTargets));
      const inRange = getActiveEnemies(enemies).filter((e) => Math.abs(e.progress - 0) <= effRange).slice(0, cap);
      for (const e of inRange) {
        damageEnemy(e, e === primary ? resolvedDamage * 0.25 : resolvedDamage * 0.5, pendingTriggeredSpawns);
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

function applyChainDamage(_tower, primary, baseDamage, chainTargets, decay, enemies, effRange, pendingTriggeredSpawns) {
  const safeTargets = Math.min(chainTargets, balanceRules.maxChainTargets);
  const candidates = getActiveEnemies(enemies)
    .filter((e) => e !== primary && Math.abs(e.progress - primary.progress) <= effRange)
    .sort((a, b) => Math.abs(a.progress - primary.progress) - Math.abs(b.progress - primary.progress))
    .slice(0, safeTargets);
  let ratio = 0.75;
  for (const e of candidates) {
    damageEnemy(e, baseDamage * (decay ? ratio : 1), pendingTriggeredSpawns);
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

function runScenarioStats(scenario, seeds = SEEDS_PER_SCENARIO) {
  const waves = [];
  const firstLeaks = [];
  for (let s = 0; s < seeds; s += 1) {
    const seed = scenario.baseSeed + s * 9973;
    const r = simulateSurvival(scenario.specs, seed);
    waves.push(r.wavesCleared);
    firstLeaks.push(r.firstLeakWave ?? r.gameOverWave);
  }
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    medianWaves: median(waves),
    minWaves: Math.min(...waves),
    maxWaves: Math.max(...waves),
    meanWaves: mean(waves),
    medianFirstLeak: median(firstLeaks.filter((x) => x != null)),
    runs: waves.map((w, i) => ({ seed: scenario.baseSeed + i * 9973, wavesCleared: w, firstLeak: firstLeaks[i] })),
  };
}

function printResults(rows) {
  console.log("\n=== Survival simulation (median / min–max waves cleared, 10 seeds) ===\n");
  console.log("ID     Label                                      med   min–max    mean   firstLeak(med)");
  for (const r of rows) {
    const lab = r.label.length > 40 ? `${r.label.slice(0, 37)}...` : r.label.padEnd(40);
    const mfl = Number.isFinite(r.medianFirstLeak) ? r.medianFirstLeak.toFixed(1) : String(r.medianFirstLeak);
    console.log(
      `${r.scenarioId.padEnd(6)} ${lab} ${String(r.medianWaves).padStart(5)}   ${r.minWaves}-${r.maxWaves}      ${r.meanWaves.toFixed(1).padStart(5)}   ${mfl.padStart(6)}`,
    );
  }
}

const BASE_SEED = 0xfeed2025;

function main() {
  const rows = [];
  for (const sc of SCENARIOS) {
    if (sc.id === "S10" && (!sc.specs || sc.specs.length === 0)) {
      console.warn("Skipping S10 — specs empty. Set SCENARIOS S10 specs after tuning.");
      continue;
    }
    rows.push(runScenarioStats({ ...sc, baseSeed: BASE_SEED }, SEEDS_PER_SCENARIO));
  }
  printResults(rows);
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
