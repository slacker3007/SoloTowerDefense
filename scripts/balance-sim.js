import {
  balanceRules,
  economy,
  enemyRoleModifiers,
  getGoldPerKill,
  getTowerTierCost,
  getWaveBaseCount,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getUpgradeOptionsForTower,
  getWaveStep,
  towerCatalog,
  upgrades,
} from "../src/game/balance.js";

const WAVE_LIMIT = 15;
const WORLD_SPEED_SCALE = 60;
const STANDARD_TARGETS = [
  [{ type: "basic" }, { type: "basic" }],
  [{ type: "archer" }, { type: "basic" }],
  [{ type: "archer" }, { type: "fire" }, { type: "basic" }],
  [{ type: "archer", upgrades: ["level1"] }, { type: "fire" }, { type: "lightning" }],
  [{ type: "archer", upgrades: ["level1"] }, { type: "fire", upgrades: ["level1"] }, { type: "lightning" }, { type: "earth" }],
  [
    { type: "archer", upgrades: ["level1"] },
    { type: "fire", upgrades: ["level1"] },
    { type: "lightning", upgrades: ["level1"] },
    { type: "earth" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2"] },
    { type: "fire", upgrades: ["level1"] },
    { type: "lightning", upgrades: ["level1"] },
    { type: "earth" },
    { type: "ice" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2"] },
    { type: "fire", upgrades: ["level1", "level2"] },
    { type: "lightning", upgrades: ["level1"] },
    { type: "earth" },
    { type: "ice" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2"] },
    { type: "fire", upgrades: ["level1", "level2"] },
    { type: "lightning", upgrades: ["level1", "level2"] },
    { type: "earth", upgrades: ["level1"] },
    { type: "ice" },
    { type: "nature" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2"] },
    { type: "fire", upgrades: ["level1", "level2"] },
    { type: "lightning", upgrades: ["level1", "level2"] },
    { type: "earth", upgrades: ["level1"] },
    { type: "ice", upgrades: ["level1"] },
    { type: "nature" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2", "level3"] },
    { type: "fire", upgrades: ["level1", "level2"] },
    { type: "lightning", upgrades: ["level1", "level2"] },
    { type: "earth", upgrades: ["level1"] },
    { type: "ice", upgrades: ["level1"] },
    { type: "nature" },
    { type: "holy" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2", "level3"] },
    { type: "fire", upgrades: ["level1", "level2", "level3"] },
    { type: "lightning", upgrades: ["level1", "level2"] },
    { type: "earth", upgrades: ["level1"] },
    { type: "ice", upgrades: ["level1"] },
    { type: "nature" },
    { type: "holy" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2", "level3"] },
    { type: "fire", upgrades: ["level1", "level2", "level3"] },
    { type: "lightning", upgrades: ["level1", "level2", "level3"] },
    { type: "earth", upgrades: ["level1", "level2"] },
    { type: "ice", upgrades: ["level1"] },
    { type: "nature", upgrades: ["level1"] },
    { type: "holy" },
    { type: "dark" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2", "level3"] },
    { type: "fire", upgrades: ["level1", "level2", "level3"] },
    { type: "lightning", upgrades: ["level1", "level2", "level3"] },
    { type: "earth", upgrades: ["level1", "level2"] },
    { type: "ice", upgrades: ["level1"] },
    { type: "nature", upgrades: ["level1"] },
    { type: "holy" },
    { type: "dark" },
    { type: "archer" },
  ],
  [
    { type: "archer", upgrades: ["level1", "level2", "level3"] },
    { type: "fire", upgrades: ["level1", "level2", "level3"] },
    { type: "lightning", upgrades: ["level1", "level2", "level3"] },
    { type: "earth", upgrades: ["level1", "level2", "level3"] },
    { type: "ice", upgrades: ["level1", "level2"] },
    { type: "nature", upgrades: ["level1"] },
    { type: "holy" },
    { type: "dark" },
    { type: "archer", upgrades: ["level1"] },
  ],
];

function getStandardTargets(wave) {
  return STANDARD_TARGETS[Math.min(STANDARD_TARGETS.length - 1, Math.max(0, wave - 1))];
}

function makeBasicTower() {
  return { type: "basic", upgrades: [], damage: towerCatalog.basic.damage, cooldown: 1 / towerCatalog.basic.rate, effects: [] };
}

function convertTower(tower, targetType) {
  const base = towerCatalog[targetType] ?? towerCatalog.basic;
  tower.type = targetType;
  tower.upgrades = [];
  tower.damage = base.damage;
  tower.cooldown = 1 / base.rate;
  tower.effects = [];
}

function applyUpgrade(tower, upgradeId) {
  const upgrade = upgrades[tower.type]?.[upgradeId];
  if (!upgrade || tower.upgrades.includes(upgradeId)) {
    return false;
  }
  if (typeof upgrade.damageMultiplier === "number") {
    tower.damage *= upgrade.damageMultiplier;
  }
  if (typeof upgrade.cooldownMultiplier === "number") {
    tower.cooldown *= upgrade.cooldownMultiplier;
  }
  if (Array.isArray(upgrade.effects)) {
    tower.effects.push(...upgrade.effects);
  }
  tower.upgrades.push(upgradeId);
  return true;
}

function getUpgradeCost(upgradeId) {
  if (upgradeId === "level1") return getTowerTierCost(1);
  if (upgradeId === "level2") return getTowerTierCost(2);
  if (upgradeId === "level3") return getTowerTierCost(3);
  return economy.baseTowerCost;
}

function effectDpsMultiplier(effect) {
  if (effect.type === "burn" || effect.type === "poison") return effect.dpsFactor ?? 0;
  if (effect.type === "splash") return (effect.ratio ?? 0) * 0.65;
  if (effect.type === "chain") return Math.min(effect.targets ?? 0, balanceRules.maxChainTargets) * 0.45;
  if (effect.type === "chainNoDecay") return 1.1;
  if (effect.type === "volley" || effect.type === "volleyPierce") return Math.min(effect.arrows ?? 0, balanceRules.maxVolleyArrows) * 0.25;
  if (effect.type === "crit") return (effect.chance ?? 0) * ((effect.multiplier ?? 1) - 1);
  if (effect.type === "burstEveryHits") return ((effect.multiplier ?? 1) - 1) / Math.max(1, effect.every ?? 1);
  if (effect.type === "trueDamageEveryHits") return 0.2;
  if (effect.type === "headshotThreshold") return effect.hpThreshold ?? 0;
  if (effect.type === "bonusDamageVsRooted") return (effect.ratio ?? 0) * 0.35;
  if (effect.type === "doubleDamageVsFrozen") return 0.25;
  if (effect.type === "bonusVsDark") return (effect.ratio ?? 0) * 0.3;
  if (effect.type === "auraVulnerability" || effect.type === "curse") return effect.ratio ?? 0;
  if (effect.type === "towerAuraSpeed") return effect.ratio ?? 0;
  if (effect.type === "towerAuraRange") return (effect.ratio ?? 0) * 0.5;
  if (effect.type === "smiteBeamTargets") return Math.max(0, (effect.targets ?? 1) - 1) * 0.2;
  return 0;
}

function effectControlValue(effect) {
  if (effect.type === "slow" || effect.type === "auraSlow") return effect.ratio ?? 0;
  if (effect.type === "stunChance") return (effect.chance ?? 0) * (effect.duration ?? 0);
  if (effect.type === "rootChance") return (effect.chance ?? 0) * (effect.duration ?? 0);
  if (effect.type === "knockback") return (effect.distanceTiles ?? 0) * 0.2;
  if (effect.type === "chainKnockbackSlow") return effect.ratio ?? 0;
  if (effect.type === "weakening") return effect.ratio ?? 0;
  return 0;
}

function estimateTowerDps(tower) {
  const baseDps = tower.damage / Math.max(0.01, tower.cooldown);
  const effectMultiplier = tower.effects.reduce((sum, effect) => sum + effectDpsMultiplier(effect), 0);
  const controlMultiplier = tower.effects.reduce((sum, effect) => sum + effectControlValue(effect), 0) * 0.35;
  return baseDps * (1 + effectMultiplier + controlMultiplier);
}

function estimateCatalogDps(towerType) {
  const base = towerCatalog[towerType] ?? towerCatalog.archer;
  return base.damage * base.rate;
}

function buildWave(wave) {
  const step = getWaveStep(wave);
  const role = enemyRoleModifiers[step.role] ?? enemyRoleModifiers.normal;
  const secondaryRole = enemyRoleModifiers[step.secondaryRole] ?? null;
  const hpFactor = secondaryRole ? (role.hp + secondaryRole.hp) * 0.5 : role.hp;
  const speedFactor = secondaryRole ? (role.speed + secondaryRole.speed) * 0.5 : role.speed;
  const countFactor = secondaryRole ? (role.count + secondaryRole.count) * 0.5 : role.count;
  const hp = getWaveBaseHp(wave) * hpFactor;
  const count = Math.max(2, Math.floor(getWaveBaseCount(wave) * countFactor));
  const speed = WORLD_SPEED_SCALE * getWaveBaseSpeed(wave) * speedFactor;
  const interval = Math.max(0.35, 1.35 - wave * 0.03);
  const tags = buildEnemyTags(step.role, wave);
  const effectiveHp = tags.includes("armor") ? hp / 0.85 : hp;
  const totalHp = hp * count;
  const effectiveTotalHp = effectiveHp * count;
  return {
    wave,
    role: step.role,
    secondaryRole: step.secondaryRole ?? null,
    tags,
    count,
    hp: Math.round(hp),
    effectiveHp: Math.round(effectiveHp),
    speed: Number(speed.toFixed(1)),
    interval: Number(interval.toFixed(2)),
    spawnDuration: Number((count * interval).toFixed(1)),
    totalHp: Math.round(totalHp),
    effectiveTotalHp: Math.round(effectiveTotalHp),
    breather: Boolean(step.breather),
    rewardPerKill: getGoldPerKill(wave, step.breather),
    expectedTowerCount: step.expectedTowerCount ?? null,
    expectedDpsBand: step.expectedDpsBand ?? null,
  };
}

function buildEnemyTags(role, wave) {
  const tags = [role];
  if (wave >= 8 && (role === "tank" || role === "elite")) {
    tags.push("armor");
  }
  if (wave >= 12 && role === "fast") {
    tags.push("slowResist");
  }
  if (wave >= 10 && role === "elite") {
    tags.push("burnImmune");
  }
  return tags;
}

function canUpgradeFrom(tower, upgradeId) {
  return getUpgradeOptionsForTower({
    type: tower.type,
    tier: tower.upgrades.includes("level3") || tower.upgrades.includes("level3") ? 3 : tower.upgrades.some((id) => id.startsWith("t2")) ? 2 : tower.upgrades.includes("level1") ? 1 : 0,
    branch: tower.upgrades.includes("level2") ? "a" : tower.upgrades.includes("level2") ? "b" : null,
  }).some((option) => option.id === upgradeId);
}

function prepareForWave(buildState, wave) {
  const targetRoster = getStandardTargets(wave);
  const actions = [];
  for (let index = 0; index < targetRoster.length; index += 1) {
    const target = targetRoster[index];
    while (!buildState.towers[index] && buildState.gold >= economy.baseTowerCost) {
      buildState.gold -= economy.baseTowerCost;
      buildState.towers.push(makeBasicTower());
      actions.push(`build basic (-${economy.baseTowerCost})`);
    }
    const tower = buildState.towers[index];
    if (!tower) {
      buildState.missed.push({ wave, action: `build ${target.type}`, neededGold: economy.baseTowerCost - buildState.gold });
      break;
    }
    if (tower.type === "basic" && target.type !== "basic") {
      if (buildState.gold >= economy.conversionCost) {
        buildState.gold -= economy.conversionCost;
        convertTower(tower, target.type);
        actions.push(`convert ${target.type} (-${economy.conversionCost})`);
      } else {
        buildState.missed.push({ wave, action: `convert ${target.type}`, neededGold: economy.conversionCost - buildState.gold });
        continue;
      }
    }
    for (const upgradeId of target.upgrades ?? []) {
      if (tower.upgrades.includes(upgradeId)) {
        continue;
      }
      const cost = getUpgradeCost(upgradeId);
      if (!canUpgradeFrom(tower, upgradeId)) {
        buildState.missed.push({ wave, action: `${tower.type} ${upgradeId}`, neededGold: 0, invalid: true });
        continue;
      }
      if (buildState.gold >= cost && applyUpgrade(tower, upgradeId)) {
        buildState.gold -= cost;
        actions.push(`${tower.type} ${upgradeId} (-${cost})`);
      } else {
        buildState.missed.push({ wave, action: `${tower.type} ${upgradeId}`, neededGold: cost - buildState.gold });
        break;
      }
    }
  }
  return actions;
}

function summarizeBuildState(buildState) {
  const teamDps = buildState.towers.reduce((sum, tower) => sum + estimateTowerDps(tower), 0);
  const roster = buildState.towers
    .map((tower) => `${tower.type}${tower.upgrades.length > 0 ? `:${tower.upgrades.join("/")}` : ""}`)
    .join(",");
  return {
    towerCount: buildState.towers.length,
    teamDps,
    roster,
  };
}

function classifyPressure(row, previousRow) {
  if (row.ttk > 150 || row.pressureRatio > 1.45) return "spike";
  if (row.ttk < 10 || row.pressureRatio < 0.55) return "dip";
  if (previousRow && row.totalHp / Math.max(1, previousRow.totalHp) > 2.2) return "hp-jump";
  return "ok";
}

function run() {
  const rows = [];
  const sanity = [];
  const buildState = {
    gold: economy.startingGold,
    towers: [],
    missed: [],
  };
  for (let wave = 1; wave <= WAVE_LIMIT; wave += 1) {
    const startGold = buildState.gold;
    const actions = prepareForWave(buildState, wave);
    const waveData = buildWave(wave);
    const buildSummary = summarizeBuildState(buildState);
    const timeToKill = waveData.effectiveTotalHp / Math.max(1, buildSummary.teamDps);
    const clearTime = Math.max(timeToKill, waveData.spawnDuration);
    const waveGold = waveData.count * waveData.rewardPerKill;
    const pressureRatio = waveData.expectedDpsBand
      ? buildSummary.teamDps / ((waveData.expectedDpsBand[0] + waveData.expectedDpsBand[1]) * 0.5)
      : 1;
    buildState.gold += waveGold;
    const row = {
      ...waveData,
      startGold,
      endGold: buildState.gold,
      actions,
      roster: buildSummary.roster,
      towerCount: buildSummary.towerCount,
      teamDps: Math.round(buildSummary.teamDps),
      ttk: Number(timeToKill.toFixed(1)),
      clearTime: Number(clearTime.toFixed(1)),
      pressureRatio: Number(pressureRatio.toFixed(2)),
      waveGold,
    };
    row.flag = classifyPressure(row, rows[rows.length - 1]);
    rows.push(row);
    const maxTtk = waveData.role === "elite" || waveData.role === "tank" ? 180 : 75;
    sanity.push({
      wave,
      spawnCountPositive: waveData.count > 0,
      hpPositive: waveData.hp > 0,
      speedPositive: waveData.speed > 0,
      sensibleTtk: timeToKill > 6 && timeToKill < maxTtk,
      economyNonNegative: startGold >= 0 && buildState.gold >= 0,
      pressureInBand: pressureRatio >= 0.55 && pressureRatio <= 1.75,
      expectedBandValid:
        !waveData.expectedDpsBand ||
        (Array.isArray(waveData.expectedDpsBand) &&
          waveData.expectedDpsBand.length === 2 &&
          waveData.expectedDpsBand[0] > 0 &&
          waveData.expectedDpsBand[1] >= waveData.expectedDpsBand[0]),
    });
  }
  const upgradeSanity = Object.keys(towerCatalog).map((towerType) => {
    const startOptions = getUpgradeOptionsForTower({ tier: 0, branch: null, type: towerType });
    const pathA = getUpgradeOptionsForTower({ tier: 2, branch: "a", type: towerType });
    const pathB = getUpgradeOptionsForTower({ tier: 2, branch: "b", type: towerType });
    const isBasic = towerType === "basic";
    return {
      towerType,
      hasTier1: isBasic ? true : startOptions.some((entry) => entry.id === "level1"),
      hasTier3A: isBasic ? true : pathA.some((entry) => entry.id === "level3"),
      hasTier3B: isBasic ? true : pathB.some((entry) => entry.id === "level3"),
      hasConversions: isBasic ? startOptions.some((entry) => String(entry.id).startsWith("convert:")) : true,
    };
  });

  console.log(`Base tower DPS: ${Object.keys(towerCatalog).map((towerType) => `${towerType}=${estimateCatalogDps(towerType).toFixed(1)}`).join(" | ")}`);
  console.log("\nStandard build wave simulation (1-15):");
  for (const row of rows) {
    console.log(
      `W${row.wave} ${row.role}${row.secondaryRole ? `/${row.secondaryRole}` : ""} count=${row.count} hp=${row.hp}${row.effectiveHp !== row.hp ? `/eff${row.effectiveHp}` : ""} spawn=${row.spawnDuration}s dps=${row.teamDps} ttk=${row.ttk}s clear=${row.clearTime}s pressure=${row.pressureRatio} gold=${row.startGold}->${row.endGold} ${row.flag}${row.breather ? " breather" : ""}`,
    );
    if (row.actions.length > 0) {
      console.log(`  actions: ${row.actions.join(", ")}`);
    }
    console.log(`  roster: ${row.roster || "(none)"}`);
  }
  const failed = sanity.filter((entry) => Object.values(entry).includes(false));
  const failedUpgrade = upgradeSanity.filter((entry) => Object.values(entry).includes(false));
  const missedAffordable = buildState.missed.filter((entry) => entry.neededGold > 0);
  if (buildState.missed.length > 0) {
    console.log("\nMissed standard-build milestones:");
    for (const entry of buildState.missed.slice(0, 12)) {
      console.log(`W${entry.wave} ${entry.action}${entry.invalid ? " invalid path" : ` needs +${Math.ceil(entry.neededGold)} gold`}`);
    }
  }
  if (failed.length > 0 || failedUpgrade.length > 0) {
    console.error("\nSanity checks failed:", { waves: failed, upgrades: failedUpgrade });
    process.exit(1);
  }
  console.log(
    `\nSanity checks passed for waves 1-15, upgrade graph, and economy model.${missedAffordable.length > 0 ? " Some desired milestones were intentionally unaffordable and listed above." : ""}`,
  );
}

run();
