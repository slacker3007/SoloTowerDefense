const TILE_RANGE_TO_WORLD = 64;
const CC_UPTIME_CAP = 0.6;
const CC_WINDOW_SECONDS = 12;
const MAX_CHAIN_TARGETS = 6;
const MAX_VOLLEY_ARROWS = 7;

const UPGRADE_GRAPH = {
  base: [{ id: "t1", tier: 1, path: null }],
  t1: [
    { id: "t2a", tier: 2, path: "a" },
    { id: "t2b", tier: 2, path: "b" },
  ],
  t2a: [{ id: "t3a", tier: 3, path: "a" }],
  t2b: [{ id: "t3b", tier: 3, path: "b" }],
};

export const BASIC_CONVERSION_ORDER = ["archer", "lightning", "earth", "fire", "holy", "ice", "dark", "nature"];
const ELEMENT_CONVERSIONS = [...BASIC_CONVERSION_ORDER];

export const towerCatalog = {
  basic: { label: "Basic", damage: 9, rate: 1.0, rangeTiles: 3.4, utilityBudget: 1.0, projectileSpeed: 450 },
  fire: { label: "Fire", damage: 18, rate: 0.8, rangeTiles: 3.5, utilityBudget: 0.8, projectileSpeed: 460 },
  ice: { label: "Ice", damage: 8, rate: 0.7, rangeTiles: 3.5, utilityBudget: 0.75, projectileSpeed: 420 },
  lightning: { label: "Lightning", damage: 12, rate: 1.2, rangeTiles: 3.0, utilityBudget: 0.82, projectileSpeed: 500 },
  nature: { label: "Nature", damage: 6, rate: 1.0, rangeTiles: 3.5, utilityBudget: 0.75, projectileSpeed: 430 },
  earth: { label: "Earth", damage: 30, rate: 0.4, rangeTiles: 2.8, utilityBudget: 0.78, projectileSpeed: 360 },
  dark: { label: "Dark", damage: 10, rate: 0.6, rangeTiles: 3.2, utilityBudget: 0.78, projectileSpeed: 440 },
  holy: { label: "Holy", damage: 14, rate: 0.9, rangeTiles: 3.5, utilityBudget: 0.84, projectileSpeed: 470 },
  archer: { label: "Archer", damage: 11, rate: 1.3, rangeTiles: 3.8, utilityBudget: 1.0, projectileSpeed: 490 },
};

export const towerVisuals = {
  basic: { textureKey: "blueTower" },
  archer: { textureKey: "tower_archer_building" },
  lightning: { textureKey: "tower_lightning_building" },
  earth: { textureKey: "tower_earth_building" },
  fire: { textureKey: "tower_fire_building" },
  holy: { textureKey: "tower_holy_building" },
  ice: { textureKey: "tower_ice_building" },
  dark: { textureKey: "tower_dark_building" },
  nature: { textureKey: "tower_nature_building" },
};

export const economy = {
  startingGold: 200,
  startingLives: 20,
  baseTowerCost: 100,
  sellRefundRate: 0.5,
  tierCostMultiplier: {
    t1: 1.5,
    t2: 2.2,
    t3: 3.5,
  },
  conversionCost: 90,
};

export const upgrades = {
  fire: {
    t1: { damageMultiplier: 1.25, effects: [{ type: "burn", dpsFactor: 0.4, duration: 3 }] },
    t2a: { effects: [{ type: "burnStacking", maxStacks: 3, duration: 5 }] },
    t2b: { effects: [{ type: "splash", radiusTiles: 1.5, ratio: 0.6 }] },
    t3a: { effects: [{ type: "deathExplosionBurn" }] },
    t3b: { effects: [{ type: "critExplosion", chance: 0.2, multiplier: 2 }] },
  },
  ice: {
    t1: { effects: [{ type: "slow", ratio: 0.3, duration: 1.5 }] },
    t2a: { effects: [{ type: "stunChance", chance: 0.15, duration: 1.2 }] },
    t2b: { effects: [{ type: "auraSlow", ratio: 0.15, radiusTiles: 2.5 }] },
    t3a: { effects: [{ type: "doubleDamageVsFrozen" }] },
    t3b: { effects: [{ type: "auraVulnerability", ratio: 0.25 }] },
  },
  lightning: {
    t1: { effects: [{ type: "chain", targets: 2 }] },
    t2a: { rangeMultiplier: 1.2, effects: [{ type: "chain", targets: 4 }] },
    t2b: { effects: [{ type: "burstEveryHits", every: 5, multiplier: 3 }] },
    t3a: { effects: [{ type: "chainNoDecay" }] },
    t3b: { effects: [{ type: "burstAllInRange" }] },
  },
  nature: {
    t1: { effects: [{ type: "poison", dpsFactor: 0.6, duration: 4 }] },
    t2a: { effects: [{ type: "poisonSpreadOnDeath" }] },
    t2b: { effects: [{ type: "rootChance", chance: 0.1, duration: 1.5 }] },
    t3a: { effects: [{ type: "poisonInfiniteStack" }] },
    t3b: { effects: [{ type: "bonusDamageVsRooted", ratio: 0.5 }] },
  },
  earth: {
    t1: { effects: [{ type: "splash", radiusTiles: 1.2, ratio: 0.75 }] },
    t2a: { damageMultiplier: 1.8, cooldownMultiplier: 1.3 },
    t2b: { effects: [{ type: "knockback", distanceTiles: 0.3 }] },
    t3a: { effects: [{ type: "aoeStun", duration: 0.8 }] },
    t3b: { effects: [{ type: "chainKnockbackSlow", ratio: 0.2, duration: 1.2 }] },
  },
  dark: {
    t1: { effects: [{ type: "curse", ratio: 0.15, duration: 4 }] },
    t2a: { effects: [{ type: "drain", ratio: 0.2 }] },
    t2b: { effects: [{ type: "weakening", ratio: 0.25, duration: 3 }] },
    t3a: { effects: [{ type: "overhealShield" }] },
    t3b: { effects: [{ type: "curseSpread" }] },
  },
  holy: {
    t1: { effects: [{ type: "bonusVsDark", ratio: 0.5 }] },
    t2a: { effects: [{ type: "towerAuraSpeed", ratio: 0.2, radiusTiles: 2.5 }] },
    t2b: { effects: [{ type: "trueDamageEveryHits", every: 4 }] },
    t3a: { effects: [{ type: "towerAuraRange", ratio: 0.15 }] },
    t3b: { effects: [{ type: "smiteBeamTargets", targets: 3 }] },
  },
  archer: {
    t1: { cooldownMultiplier: 0.75 },
    t2a: { rangeMultiplier: 1.25, effects: [{ type: "crit", chance: 0.25, multiplier: 2 }] },
    t2b: { effects: [{ type: "volley", arrows: 3 }] },
    t3a: { effects: [{ type: "headshotThreshold", hpThreshold: 0.15 }] },
    t3b: { effects: [{ type: "volleyPierce", arrows: 5, pierce: 2 }] },
  },
};

export const upgradeMeta = {
  t1: { label: "Tier 1", cost: () => getTowerTierCost(1) },
  t2a: { label: "Path A", cost: () => getTowerTierCost(2) },
  t2b: { label: "Path B", cost: () => getTowerTierCost(2) },
  t3a: { label: "Tier 3A", cost: () => getTowerTierCost(3) },
  t3b: { label: "Tier 3B", cost: () => getTowerTierCost(3) },
};

export const enemyRoleModifiers = {
  normal: { hp: 1.0, speed: 1.0, count: 1.0 },
  fast: { hp: 0.6, speed: 1.6, count: 1.0 },
  tank: { hp: 2.2, speed: 0.6, count: 1.0 },
  swarm: { hp: 0.35, speed: 1.0, count: 2.0 },
  elite: { hp: 4.0, speed: 0.8, count: 1.0 },
};

export const waveProgram = [
  { role: "normal", breather: false, expectedTowerCount: 2, expectedDpsBand: [20, 28] },
  { role: "normal", breather: false, expectedTowerCount: 2, expectedDpsBand: [24, 34] },
  { role: "fast", breather: false, expectedTowerCount: 3, expectedDpsBand: [30, 44] },
  { role: "normal", breather: false, expectedTowerCount: 3, expectedDpsBand: [36, 52] },
  { role: "tank", breather: true, expectedTowerCount: 4, expectedDpsBand: [46, 64] },
  { role: "normal", secondaryRole: "fast", breather: false, expectedTowerCount: 4, expectedDpsBand: [58, 78] },
  { role: "swarm", breather: false, expectedTowerCount: 5, expectedDpsBand: [68, 92] },
  { role: "tank", secondaryRole: "normal", breather: false, expectedTowerCount: 5, expectedDpsBand: [78, 106] },
  { role: "fast", breather: false, expectedTowerCount: 6, expectedDpsBand: [92, 124] },
  { role: "elite", secondaryRole: "normal", breather: true, expectedTowerCount: 6, expectedDpsBand: [106, 142] },
  { role: "tank", secondaryRole: "swarm", breather: false, expectedTowerCount: 7, expectedDpsBand: [122, 162] },
  { role: "fast", secondaryRole: "fast", breather: false, expectedTowerCount: 7, expectedDpsBand: [136, 178] },
  { role: "elite", secondaryRole: "tank", breather: false, expectedTowerCount: 8, expectedDpsBand: [154, 202] },
  { role: "swarm", breather: false, expectedTowerCount: 9, expectedDpsBand: [172, 226] },
  { role: "elite", secondaryRole: "elite", breather: true, expectedTowerCount: 9, expectedDpsBand: [188, 248] },
];

export const balanceRules = {
  ccUptimeCap: CC_UPTIME_CAP,
  ccWindowSeconds: CC_WINDOW_SECONDS,
  utilityDpsMin: 0.7,
  utilityDpsMax: 0.85,
  archerEfficiency: 1.0,
  maxChainTargets: MAX_CHAIN_TARGETS,
  maxVolleyArrows: MAX_VOLLEY_ARROWS,
  adaptive: {
    enabled: false,
    dominateThresholdSeconds: 24,
    struggleThresholdSeconds: 40,
    dominate: { hpScale: 1.1, speedScale: 1, countOffset: 1 },
    struggle: { hpScale: 1, speedScale: 0.9, countOffset: -1 },
    neutral: { hpScale: 1, speedScale: 1, countOffset: 0 },
  },
};

export function toWorldRange(rangeTiles) {
  return rangeTiles * TILE_RANGE_TO_WORLD;
}

export function getTowerTierCost(tier) {
  if (tier === 1) {
    return Math.floor(economy.baseTowerCost * economy.tierCostMultiplier.t1);
  }
  if (tier === 2) {
    return Math.floor(economy.baseTowerCost * economy.tierCostMultiplier.t2);
  }
  if (tier === 3) {
    return Math.floor(economy.baseTowerCost * economy.tierCostMultiplier.t3);
  }
  return economy.baseTowerCost;
}

export function getUpgradeOptionsForTower(tower) {
  if (!tower) {
    return [];
  }
  if (tower.type === "basic") {
    return ELEMENT_CONVERSIONS.map((towerType) => ({
      id: `convert:${towerType}`,
      tier: 0,
      path: null,
      label: `To ${towerCatalog[towerType]?.label ?? towerType}`,
      cost: economy.conversionCost,
    }));
  }
  const graphKey = tower.tier <= 0 ? "base" : tower.tier === 1 ? "t1" : tower.branch === "a" ? "t2a" : "t2b";
  const ids = UPGRADE_GRAPH[graphKey] ?? [];
  return ids.map((entry) => ({
    ...entry,
    label: upgradeMeta[entry.id]?.label ?? entry.id,
    cost: upgradeMeta[entry.id]?.cost?.() ?? economy.baseTowerCost,
  }));
}

export function isValidConversionTarget(towerType) {
  return ELEMENT_CONVERSIONS.includes(towerType);
}

export function getTowerDisplayName(towerType) {
  const label = towerCatalog[towerType]?.label ?? towerCatalog.basic.label;
  return `${label} Tower`;
}

export function getTowerTextureKey(towerType) {
  return towerVisuals[towerType]?.textureKey ?? towerVisuals.basic.textureKey;
}

export function clampUtilityBudget(towerType, damage, cooldownSeconds) {
  const tower = towerCatalog[towerType] ?? towerCatalog.archer;
  if (!tower || tower.utilityBudget >= 1) {
    return damage;
  }
  const archerDps = towerCatalog.archer.damage * towerCatalog.archer.rate * balanceRules.archerEfficiency;
  const minDps = archerDps * balanceRules.utilityDpsMin;
  const maxDps = archerDps * balanceRules.utilityDpsMax;
  const desiredDps = Math.min(maxDps, Math.max(minDps, tower.damage * tower.rate)) * tower.utilityBudget;
  const boundedDamage = desiredDps * Math.max(cooldownSeconds, 0.01);
  return Math.min(damage, boundedDamage);
}

export function getWaveBaseHp(waveIndex) {
  return 50 * 1.16 ** Math.max(0, waveIndex - 1);
}

export function getWaveBaseCount(waveIndex) {
  return Math.max(4, Math.floor(6 + waveIndex * 1.8));
}

export function getWaveBaseSpeed(waveIndex) {
  return 1 + waveIndex * 0.02;
}

export function getGoldPerKill(waveIndex, isBreatherWave = false) {
  const value = 8 + waveIndex * 1.5;
  return Math.round(value * (isBreatherWave ? 1.5 : 1));
}

export function getWaveStep(waveIndex) {
  return waveProgram[Math.min(waveProgram.length - 1, Math.max(0, waveIndex - 1))] ?? waveProgram[0];
}

export function getAdaptiveAdjustment(metrics) {
  if (!balanceRules.adaptive.enabled) {
    return { ...balanceRules.adaptive.neutral };
  }
  const dominates = metrics.leaksInWave === 0 && metrics.waveClearSeconds < balanceRules.adaptive.dominateThresholdSeconds;
  const struggles =
    metrics.leaksInWave >= 2 ||
    metrics.livesLostInWave >= 2 ||
    metrics.waveClearSeconds > balanceRules.adaptive.struggleThresholdSeconds;
  if (dominates) {
    return { ...balanceRules.adaptive.dominate };
  }
  if (struggles) {
    return { ...balanceRules.adaptive.struggle };
  }
  return { ...balanceRules.adaptive.neutral };
}
