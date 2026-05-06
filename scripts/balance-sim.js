import {
  balanceRules,
  economy,
  enemyRoleModifiers,
  getGoldPerKill,
  getWaveBaseCount,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getWaveStep,
  towerCatalog,
  upgrades,
} from "../src/game/balance.js";

const WAVE_LIMIT = 15;
const WORLD_SPEED_SCALE = 60;
const ELEMENT_TYPES = ["archer", "fire", "ice", "lightning", "nature", "earth", "dark", "holy"];
const FULL_UPGRADE_IDS = ["level1", "level2", "level3"];
const TIER1_UPGRADE_IDS = ["level1"];
const TIER2_UPGRADE_IDS = ["level1", "level2"];
const BASIC_DPS = towerCatalog.basic.damage * towerCatalog.basic.rate;

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

function createFullUpgradeTower(towerType) {
  return createTowerAtTier(towerType, 3);
}

function createTowerAtTier(towerType, tier) {
  const tower = makeBasicTower();
  convertTower(tower, towerType);
  const upgradeIds = tier >= 3 ? FULL_UPGRADE_IDS : tier === 2 ? TIER2_UPGRADE_IDS : TIER1_UPGRADE_IDS;
  for (const upgradeId of upgradeIds) {
    applyUpgrade(tower, upgradeId);
  }
  return tower;
}

function createRoster(towerType, count, tier) {
  return Array.from({ length: count }, () => createTowerAtTier(towerType, tier));
}

function createCandidateBestBuildScenarios() {
  const scenarios = [];
  for (const element of ELEMENT_TYPES) {
    scenarios.push({
      id: `best-candidate-single-${element}-t3`,
      label: `Best candidate: 20x ${element} T3`,
      phaseId: "phase4_best_build",
      phaseLabel: "Phase #4 - Best build search (max wave-clear)",
      towers: createRoster(element, 20, 3),
    });
  }
  for (let i = 0; i < ELEMENT_TYPES.length; i += 1) {
    for (let j = i + 1; j < ELEMENT_TYPES.length; j += 1) {
      const a = ELEMENT_TYPES[i];
      const b = ELEMENT_TYPES[j];
      scenarios.push({
        id: `best-candidate-duo-${a}-${b}`,
        label: `Best candidate: 10x ${a} T3 + 10x ${b} T3`,
        phaseId: "phase4_best_build",
        phaseLabel: "Phase #4 - Best build search (max wave-clear)",
        towers: [...createRoster(a, 10, 3), ...createRoster(b, 10, 3)],
      });
    }
  }
  scenarios.push({
    id: "best-candidate-mixed-8plus12archer",
    label: "Best candidate: 1x each element T3 + 12x archer T3",
    phaseId: "phase4_best_build",
    phaseLabel: "Phase #4 - Best build search (max wave-clear)",
    towers: [...ELEMENT_TYPES.map((towerType) => createTowerAtTier(towerType, 3)), ...createRoster("archer", 12, 3)],
  });
  return scenarios;
}

function createPhaseScenarios() {
  const phase1 = {
    id: "phase1_unlimited_basic",
    label: "Unlimited basic towers, no upgrades",
    phaseId: "phase1_unlimited_basic",
    phaseLabel: "Phase #1 - Unlimited basic, no upgrades",
    dynamicMode: "unlimitedBasic",
    towers: [],
  };
  const phase2 = ELEMENT_TYPES.map((towerType) => ({
    id: `phase2-${towerType}-t1`,
    label: `20x ${towerType} Tier1`,
    phaseId: "phase2_t1_single_element",
    phaseLabel: "Phase #2 - 20 towers, Tier 1, single-element",
    towers: createRoster(towerType, 20, 1),
  }));
  const phase3 = ELEMENT_TYPES.map((towerType) => ({
    id: `phase3-${towerType}-t3`,
    label: `20x ${towerType} Tier3`,
    phaseId: "phase3_t1_t2_t3_single_element",
    phaseLabel: "Phase #3 - 20 towers, Tier 1->2->3, single-element",
    towers: createRoster(towerType, 20, 3),
  }));
  return [phase1, ...phase2, ...phase3];
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

function summarizeTowers(towers) {
  const teamDps = towers.reduce((sum, tower) => sum + estimateTowerDps(tower), 0);
  const roster = towers
    .map((tower) => `${tower.type}${tower.upgrades.length > 0 ? `:${tower.upgrades.join("/")}` : ""}`)
    .join(",");
  return {
    towerCount: towers.length,
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

function cloneTower(tower) {
  return {
    type: tower.type,
    upgrades: [...tower.upgrades],
    damage: tower.damage,
    cooldown: tower.cooldown,
    effects: [...tower.effects],
  };
}

function getDynamicSummaryForWave(scenario, waveData, wave) {
  if (scenario.dynamicMode !== "unlimitedBasic") {
    return summarizeTowers(scenario.towers.map((tower) => cloneTower(tower)));
  }
  // Unlimited basic baseline: scale basic count each wave so there is no cap pressure.
  const targetCount = Math.max(20, (waveData.expectedTowerCount ?? 2) * 12, wave * 3);
  const teamDps = targetCount * BASIC_DPS;
  const roster = `basic x${targetCount}`;
  return {
    towerCount: targetCount,
    teamDps,
    roster,
  };
}

function runScenario(scenario) {
  const rows = [];
  const sanity = [];
  let gold = economy.startingGold;
  let firstCombatFailureWave = null;
  for (let wave = 1; wave <= WAVE_LIMIT; wave += 1) {
    const startGold = gold;
    const waveData = buildWave(wave);
    const buildSummary = getDynamicSummaryForWave(scenario, waveData, wave);
    const timeToKill = waveData.effectiveTotalHp / Math.max(1, buildSummary.teamDps);
    const clearTime = Math.max(timeToKill, waveData.spawnDuration);
    const waveGold = waveData.count * waveData.rewardPerKill;
    const maxTtk = waveData.role === "elite" || waveData.role === "tank" ? 180 : 75;
    const canClearWave = timeToKill <= maxTtk;
    if (!canClearWave && firstCombatFailureWave == null) {
      firstCombatFailureWave = wave;
    }
    const pressureRatio = waveData.expectedDpsBand
      ? buildSummary.teamDps / ((waveData.expectedDpsBand[0] + waveData.expectedDpsBand[1]) * 0.5)
      : 1;
    gold += waveGold;
    const row = {
      ...waveData,
      startGold,
      endGold: gold,
      actions: [],
      roster: buildSummary.roster,
      towerCount: buildSummary.towerCount,
      teamDps: Math.round(buildSummary.teamDps),
      ttk: Number(timeToKill.toFixed(1)),
      clearTime: Number(clearTime.toFixed(1)),
      pressureRatio: Number(pressureRatio.toFixed(2)),
      waveGold,
      canClearWave,
    };
    row.flag = classifyPressure(row, rows[rows.length - 1]);
    rows.push(row);
    sanity.push({
      wave,
      spawnCountPositive: waveData.count > 0,
      hpPositive: waveData.hp > 0,
      speedPositive: waveData.speed > 0,
      sensibleTtk: timeToKill > 6 && timeToKill < maxTtk,
      economyNonNegative: startGold >= 0 && gold >= 0,
      pressureInBand: pressureRatio >= 0.55 && pressureRatio <= 1.75,
      expectedBandValid:
        !waveData.expectedDpsBand ||
        (Array.isArray(waveData.expectedDpsBand) &&
          waveData.expectedDpsBand.length === 2 &&
          waveData.expectedDpsBand[0] > 0 &&
          waveData.expectedDpsBand[1] >= waveData.expectedDpsBand[0]),
    });
  }
  const failed = sanity.filter((entry) => Object.values(entry).includes(false));
  const spikeWaves = rows.filter((row) => row.flag === "spike").map((row) => row.wave);
  const waveClear = firstCombatFailureWave == null ? WAVE_LIMIT : firstCombatFailureWave - 1;
  const avgPressure = rows.reduce((sum, row) => sum + row.pressureRatio, 0) / Math.max(1, rows.length);
  const worstTtk = rows.reduce((max, row) => Math.max(max, row.ttk), 0);
  const firstFailWave = failed.length > 0 ? failed[0].wave : null;
  return {
    scenario,
    rows,
    failed,
    spikeWaves,
    finalGold: gold,
    waveClear,
    avgPressure,
    worstTtk,
    firstFailWave,
  };
}

function printScenario(result) {
  console.log(`\n=== ${result.scenario.label} (${result.scenario.id}) ===`);
  for (const row of result.rows) {
    console.log(
      `W${row.wave} ${row.role}${row.secondaryRole ? `/${row.secondaryRole}` : ""} count=${row.count} hp=${row.hp}${row.effectiveHp !== row.hp ? `/eff${row.effectiveHp}` : ""} spawn=${row.spawnDuration}s dps=${row.teamDps} ttk=${row.ttk}s clear=${row.clearTime}s pressure=${row.pressureRatio} gold=${row.startGold}->${row.endGold} ${row.flag}${row.breather ? " breather" : ""}`,
    );
    console.log(`  roster: ${row.roster || "(none)"}`);
  }
  console.log(
    `Summary: waveClear=${result.waveClear}/${WAVE_LIMIT} finalGold=${Math.round(result.finalGold)} spikes=${result.spikeWaves.length > 0 ? result.spikeWaves.join(",") : "none"} firstFailWave=${result.firstFailWave ?? "none"}`,
  );
}

function printPhaseSummary(phaseLabel, results) {
  const sorted = [...results].sort((a, b) => b.waveClear - a.waveClear);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const failedCount = results.filter((entry) => entry.failed.length > 0).length;
  console.log(
    `\n[${phaseLabel}] best=${best.scenario.id}(${best.waveClear}) median=${median.scenario.id}(${median.waveClear}) worst=${worst.scenario.id}(${worst.waveClear}) failedScenarios=${failedCount}/${results.length}`,
  );
}

function selectBestBuild(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    if (b.waveClear !== a.waveClear) return b.waveClear - a.waveClear;
    const aFailCount = a.failed.length;
    const bFailCount = b.failed.length;
    if (aFailCount !== bFailCount) return aFailCount - bFailCount;
    if (b.avgPressure !== a.avgPressure) return b.avgPressure - a.avgPressure;
    return a.worstTtk - b.worstTtk;
  });
  return sorted[0];
}

function run() {
  console.log(`Base tower DPS: ${Object.keys(towerCatalog).map((towerType) => `${towerType}=${estimateCatalogDps(towerType).toFixed(1)}`).join(" | ")}`);

  const baseScenarios = createPhaseScenarios();
  const baseResults = baseScenarios.map((scenario) => runScenario(scenario));
  const phaseGroups = {
    phase1_unlimited_basic: baseResults.filter((result) => result.scenario.phaseId === "phase1_unlimited_basic"),
    phase2_t1_single_element: baseResults.filter((result) => result.scenario.phaseId === "phase2_t1_single_element"),
    phase3_t1_t2_t3_single_element: baseResults.filter((result) => result.scenario.phaseId === "phase3_t1_t2_t3_single_element"),
  };

  for (const phaseId of Object.keys(phaseGroups)) {
    const phaseResults = phaseGroups[phaseId];
    if (phaseResults.length === 0) continue;
    console.log(`\n######## ${phaseResults[0].scenario.phaseLabel} ########`);
    for (const result of phaseResults) {
      printScenario(result);
    }
    printPhaseSummary(phaseResults[0].scenario.phaseLabel, phaseResults);
  }

  const bestCandidates = createCandidateBestBuildScenarios().map((scenario) => runScenario(scenario));
  const bestBuild = selectBestBuild(bestCandidates);
  console.log(`\n######## Phase #4 - Best build search (max wave-clear) ########`);
  printScenario(bestBuild);
  console.log(`Selected best build from ${bestCandidates.length} candidates: ${bestBuild.scenario.id}`);

  const allResults = [...baseResults, bestBuild];
  console.log("\n=== Compact scenario comparison ===");
  console.log("scenarioId                        waveClear  avgPressure  worstTtk  firstFailWave");
  for (const result of allResults) {
    const scenarioId = String(result.scenario.id).padEnd(32);
    const waveClearLabel = `${result.waveClear}/${WAVE_LIMIT}`.padStart(9);
    const avgPressureLabel = result.avgPressure.toFixed(2).padStart(11);
    const worstTtkLabel = result.worstTtk.toFixed(1).padStart(8);
    const firstFailLabel = String(result.firstFailWave ?? "none").padStart(13);
    console.log(`${scenarioId} ${waveClearLabel} ${avgPressureLabel} ${worstTtkLabel} ${firstFailLabel}`);
  }

  const failedResults = allResults
    .filter((entry) => entry.failed.length > 0)
    .map((entry) => ({
      scenarioId: entry.scenario.id,
      failedWaves: entry.failed.map((wave) => wave.wave),
    }));
  if (failedResults.length > 0) {
    console.error("\nSanity checks failed:", failedResults);
    process.exit(1);
  }
  console.log("\nSanity checks passed for all scenarios.");
}

run();
