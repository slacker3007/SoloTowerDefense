/**
 * Recomputes wave pack HP/speed/gold and tower tier DPS in docs/balance-export.json
 * from live balance.js + enemyCatalog (spawn rules mirror WaveSystem).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  balanceRules,
  getEnemyArchetype,
  getGoldPerKill,
  getHeavyEnemyEarlyHpMultiplier,
  getTowerEffectiveDps,
  getWaveBaseHp,
  getWaveBaseSpeed,
  toWorldRange,
  towerBaseEffects,
  towerCatalog,
  upgrades,
} from "../src/game/balance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_PATH = join(__dirname, "../docs/balance-export.json");

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function rebuildPackStats(waveIndex, pack) {
  const archetype = getEnemyArchetype(pack.type ?? "grunt");
  const baseHp = getWaveBaseHp(waveIndex);
  const packHpMult = Number.isFinite(pack.hpMultiplier) ? pack.hpMultiplier : 1;
  const packSpeedMult = Number.isFinite(pack.speedMultiplier) ? pack.speedMultiplier : 1;
  let hp = baseHp * (archetype.hpMultiplier ?? 1) * packHpMult;
  const role = archetype.role ?? "normal";
  if (role === "tank" || role === "elite") {
    hp *= getHeavyEnemyEarlyHpMultiplier(waveIndex);
  }
  const speed =
    60 * getWaveBaseSpeed(waveIndex) * (archetype.speedMultiplier ?? 1) * packSpeedMult;
  const rewardBase = getGoldPerKill(waveIndex, false);
  /** Export uses `packRewardMultiplier`; balance `WaveSystem` uses `pack.rewardMultiplier` for the same pack-level factor. */
  const packRewardMult = Number.isFinite(pack.packRewardMultiplier) ? pack.packRewardMultiplier : 1;
  const rm = archetype.rewardMultiplier ?? 1;
  const rewardGold = Math.max(1, Math.round(rewardBase * rm * packRewardMult));
  const tags = [...new Set([role, ...(archetype.tags ?? []), ...(pack.tags ?? [])])];
  const shieldHp = Number.isFinite(archetype.shieldHpMultiplier) ? hp * archetype.shieldHpMultiplier : 0;

  const rewardFormula = `round(${rewardBase} * ${round3(rm)} * ${packRewardMult})`;

  pack.hp = round3(hp);
  pack.speed = round3(speed);
  pack.role = role;
  pack.tags = tags;
  pack.rewardGold = rewardGold;
  pack.rewardBase = rewardBase;
  pack.rewardMultiplier = round3(rm);
  pack.packRewardMultiplier = packRewardMult;
  pack.rewardFormula = rewardFormula;
  pack.hpFormulaParts = {
    waveBaseHp: round3(baseHp),
    archetypeHpMultiplier: archetype.hpMultiplier ?? 1,
    packHpMultiplier: packHpMult,
    heavyHpEarlyMultiplier: role === "tank" || role === "elite" ? getHeavyEnemyEarlyHpMultiplier(waveIndex) : 1,
  };
  pack.speedFormulaParts = {
    waveBaseSpeed: round3(60 * getWaveBaseSpeed(waveIndex)),
    archetypeSpeedMultiplier: archetype.speedMultiplier ?? 1,
    packSpeedMultiplier: packSpeedMult,
  };

  if (shieldHp > 0) {
    pack.shieldHp = round3(shieldHp);
  } else {
    delete pack.shieldHp;
  }
}

function rebuildWaveAggregates(wave) {
  const wi = wave.wave;
  wave.expectedDpsBand = [16 + wi * 8, 26 + wi * 11];
  wave.expectedTowerCount = Math.max(2, 2 + Math.floor((wi - 1) * 0.5));
  wave.rewardBaseGoldPerKill = getGoldPerKill(wi, false);

  let totalSpawn = 0;
  let goldSum = 0;
  for (const pack of wave.packs ?? []) {
    const c = Math.max(0, Number(pack.count) || 0);
    totalSpawn += c;
    goldSum += c * (pack.rewardGold ?? 0);
  }
  wave.totalSpawnCount = totalSpawn;
  wave.guaranteedGoldIfAllKilled = goldSum;
  wave.maxGoldBeforeTowerBonuses = goldSum;
}

function applyUpgradePath(type, upgradeIds) {
  const base = towerCatalog[type] ?? towerCatalog.basic;
  let damage = base.damage;
  let cooldown = 1 / base.rate;
  let rangeTiles = base.rangeTiles;
  for (const id of upgradeIds) {
    const u = upgrades[type]?.[id];
    if (!u) continue;
    if (typeof u.damageMultiplier === "number") damage *= u.damageMultiplier;
    if (typeof u.cooldownMultiplier === "number") cooldown *= u.cooldownMultiplier;
    if (typeof u.rangeMultiplier === "number") rangeTiles *= u.rangeMultiplier;
  }
  return { damage, cooldown, rangeTiles, utilityBudget: base.utilityBudget ?? 1, projectileSpeed: base.projectileSpeed };
}

function rebuildTowerEntry(towerKey, entry) {
  if (!towerCatalog[towerKey]) return;
  const base = towerCatalog[towerKey];
  const baseFx = towerBaseEffects[towerKey];
  if (Array.isArray(baseFx) && baseFx.length > 0) {
    entry.baseEffectsOnConversion = baseFx.map((e) => ({ ...e, implementedInCombatSystem: true }));
  }
  entry.baseStats = {
    damage: base.damage,
    ratePerSecond: base.rate,
    cooldownSeconds: round3(1 / base.rate),
    rangeTiles: base.rangeTiles,
    rangeWorld: round3(toWorldRange(base.rangeTiles)),
    projectileSpeed: base.projectileSpeed,
    utilityBudget: base.utilityBudget ?? 1,
  };

  for (const tier of entry.tiers ?? []) {
    const path = [];
    if (tier.tier >= 1) path.push("level1");
    if (tier.tier >= 2) path.push("level2");
    if (tier.tier >= 3) path.push("level3");
    const st = applyUpgradePath(towerKey, path);
    const cd = round3(st.cooldown);
    const rate = round3(1 / st.cooldown);
    const rawDps = round3(st.damage / st.cooldown);
    const { effectiveDps, isUtilityLimited } = getTowerEffectiveDps(towerKey, st.damage, st.cooldown);
    tier.stats = {
      ...tier.stats,
      damage: round3(st.damage),
      ratePerSecond: rate,
      cooldownSeconds: cd,
      rangeTiles: round3(st.rangeTiles),
      rangeWorld: round3(toWorldRange(st.rangeTiles)),
      projectileSpeed: st.projectileSpeed,
      utilityBudget: st.utilityBudget,
      rawDps,
      effectiveDps: round3(effectiveDps),
      utilityLimited: isUtilityLimited,
    };
  }
}

const raw = readFileSync(EXPORT_PATH, "utf8");
const data = JSON.parse(raw);

data.rules.utilityDpsMax = balanceRules.utilityDpsMax;
if (data.rules?.heavyEnemyEarlyHpRamp) {
  delete data.rules.heavyEnemyEarlyHpRamp.tankEliteHpScale;
}

for (const wave of data.waves ?? []) {
  const wi = wave.wave;
  for (const pack of wave.packs ?? []) {
    rebuildPackStats(wi, pack);
  }
  rebuildWaveAggregates(wave);
}

if (data.goldByWave) {
  for (const row of data.goldByWave) {
    const wi = row.wave;
    row.baseGoldPerKill = getGoldPerKill(wi, false);
    const w = data.waves?.find((x) => x.wave === wi);
    if (w) {
      row.guaranteedGoldIfAllKilled = w.guaranteedGoldIfAllKilled;
      row.maxGoldBeforeTowerBonuses = w.maxGoldBeforeTowerBonuses;
    }
  }
}

for (const key of Object.keys(data.towers ?? {})) {
  rebuildTowerEntry(key, data.towers[key]);
}

writeFileSync(EXPORT_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("Updated", EXPORT_PATH);
