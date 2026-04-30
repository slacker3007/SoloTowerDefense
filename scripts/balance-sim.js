import {
  enemyRoleModifiers,
  getGoldPerKill,
  getWaveBaseCount,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getUpgradeOptionsForTower,
  getWaveStep,
  towerCatalog,
} from "../src/game/balance.js";

function estimateTowerDps(towerType, tier = 0) {
  const base = towerCatalog[towerType] ?? towerCatalog.archer;
  const baseline = base.damage * base.rate;
  if (tier <= 0) return baseline;
  if (tier === 1) return baseline * 1.25;
  if (tier === 2) return baseline * 1.7;
  return baseline * 2.5;
}

function buildWave(wave) {
  const step = getWaveStep(wave);
  const role = enemyRoleModifiers[step.role] ?? enemyRoleModifiers.normal;
  const hp = getWaveBaseHp(wave) * role.hp;
  const count = Math.floor(getWaveBaseCount(wave) * role.count);
  const speed = 60 * getWaveBaseSpeed(wave) * role.speed;
  const totalHp = hp * count;
  return {
    wave,
    role: step.role,
    count,
    hp: Math.round(hp),
    speed: Number(speed.toFixed(1)),
    totalHp: Math.round(totalHp),
    breather: Boolean(step.breather),
    rewardPerKill: getGoldPerKill(wave, step.breather),
    expectedTowerCount: step.expectedTowerCount ?? null,
    expectedDpsBand: step.expectedDpsBand ?? null,
  };
}

function estimateBuildState(wave) {
  const towerCount = Math.min(10, 2 + Math.floor(wave / 2));
  const avgTier = wave < 6 ? 0 : wave < 11 ? 1 : wave < 15 ? 2 : 3;
  const dpsByTower = [
    estimateTowerDps("archer", avgTier),
    estimateTowerDps("fire", avgTier),
    estimateTowerDps("ice", Math.max(0, avgTier - 1)),
    estimateTowerDps("lightning", avgTier),
  ];
  const avgDps = dpsByTower.reduce((sum, value) => sum + value, 0) / dpsByTower.length;
  return {
    towerCount,
    avgTier,
    teamDps: towerCount * avgDps,
  };
}

function run() {
  const rows = [];
  const sanity = [];
  for (let wave = 1; wave <= 15; wave += 1) {
    const waveData = buildWave(wave);
    const buildState = estimateBuildState(wave);
    const timeToKill = waveData.totalHp / Math.max(1, buildState.teamDps);
    const waveGold = waveData.count * waveData.rewardPerKill;
    rows.push({
      ...waveData,
      teamDps: Math.round(buildState.teamDps),
      ttk: Number(timeToKill.toFixed(1)),
      waveGold,
    });
    const maxTtk = waveData.role === "elite" || waveData.role === "tank" ? 240 : 80;
    sanity.push({
      wave,
      spawnCountPositive: waveData.count > 0,
      hpPositive: waveData.hp > 0,
      speedPositive: waveData.speed > 0,
      sensibleTtk: timeToKill > 6 && timeToKill < maxTtk,
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
      hasTier1: isBasic ? true : startOptions.some((entry) => entry.id === "t1"),
      hasTier3A: isBasic ? true : pathA.some((entry) => entry.id === "t3a"),
      hasTier3B: isBasic ? true : pathB.some((entry) => entry.id === "t3b"),
      hasConversions: isBasic ? startOptions.some((entry) => String(entry.id).startsWith("convert:")) : true,
    };
  });

  console.log("Wave simulation (1-15):");
  for (const row of rows) {
    console.log(
      `W${row.wave} ${row.role} count=${row.count} hp=${row.hp} totalHp=${row.totalHp} dps=${row.teamDps} ttk=${row.ttk}s gold=${row.waveGold}${row.breather ? " breather" : ""}`,
    );
  }
  const failed = sanity.filter((entry) => Object.values(entry).includes(false));
  const failedUpgrade = upgradeSanity.filter((entry) => Object.values(entry).includes(false));
  if (failed.length > 0 || failedUpgrade.length > 0) {
    console.error("\nSanity checks failed:", { waves: failed, upgrades: failedUpgrade });
    process.exit(1);
  }
  console.log("\nSanity checks passed for waves 1-15 and upgrade graph.");
}

run();
