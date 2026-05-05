const TILE_RANGE_TO_WORLD = 64;
const CC_UPTIME_CAP = 0.6;
const CC_WINDOW_SECONDS = 12;
const MAX_CHAIN_TARGETS = 6;
const MAX_VOLLEY_ARROWS = 7;

const UPGRADE_PATH = ["level1", "level2", "level3"];
export const MAX_TOWER_LEVEL = UPGRADE_PATH.length;

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

export const towerUiMeta = {
  basic: {
    description: "Balanced starter tower with steady damage and reliable range.",
  },
  fire: {
    description: "High burst damage with burn-focused upgrades.",
  },
  ice: {
    description: "Control tower that slows enemies and sets up disables.",
  },
  lightning: {
    description: "Fast attacks with chain and burst potential.",
  },
  nature: {
    description: "Damage-over-time specialist with poison and root utility.",
  },
  earth: {
    description: "Heavy-hitting shots with strong splash and crowd control.",
  },
  dark: {
    description: "Debuff-oriented tower with curse and sustain effects.",
  },
  holy: {
    description: "Supportive damage dealer with anti-dark and aura upgrades.",
  },
  archer: {
    description: "Long-range rapid fire with crit and volley paths.",
  },
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

export const towerProjectileColors = {
  basic: 0xf5d742,
  fire: 0xff5a1f,
  ice: 0x66e0ff,
  lightning: 0xfff066,
  nature: 0x7ad858,
  earth: 0xb98648,
  dark: 0x9b3bd6,
  holy: 0xfff3b0,
  archer: 0xe6d0a4,
};

export const towerUiAccentColors = {
  basic: 0x6aa9ff,
  fire: 0xff6b3d,
  ice: 0x66dbff,
  lightning: 0xffeb66,
  nature: 0x7ad858,
  earth: 0xc79a63,
  dark: 0xb06cff,
  holy: 0xfff2b3,
  archer: 0xe6d0a4,
};

export const statusColors = {
  burn: { tint: 0xff7a3a, ring: 0xff5a1f },
  poison: { tint: 0x9bd66c, ring: 0x4ea93a },
  slow: { tint: 0x9adfff, ring: 0x3aa4d8 },
  stun: { tint: 0xfff39e, ring: 0xffd23a },
  root: { tint: 0x9ed18d, ring: 0x3a8a3a },
  curse: { tint: 0xc7a5ff, ring: 0x7d3ad3 },
  weakening: { tint: 0xb59bd9, ring: 0x6b4dab },
  vulnerability: { tint: 0xff9bb4, ring: 0xd84a7a },
};

export const STATUS_PRIORITY = ["stun", "root", "burn", "poison", "vulnerability", "slow", "curse", "weakening"];

export function getTowerProjectileColor(towerType) {
  return towerProjectileColors[towerType] ?? towerProjectileColors.basic;
}

export function getTowerUiAccentColor(towerType) {
  return towerUiAccentColors[towerType] ?? towerUiAccentColors.basic;
}

export function getStatusColors(statusType) {
  return statusColors[statusType] ?? null;
}

export const economy = {
  startingGold: 220,
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
    level1: {
      damageMultiplier: 1.25,
      effects: [{ type: "burn", dpsFactor: 0.4, duration: 3 }],
      summary: "Adds burn DoT and boosts damage.",
    },
    level2: {
      damageMultiplier: 1.2,
      effects: [
        { type: "burnStacking", maxStacks: 3, duration: 5 },
        { type: "splash", radiusTiles: 1.5, ratio: 0.6 },
      ],
      summary: "Stacking burns and splash damage.",
    },
    level3: {
      damageMultiplier: 1.2,
      effects: [
        { type: "deathExplosionBurn" },
        { type: "critExplosion", chance: 0.2, multiplier: 2 },
      ],
      summary: "Death explosions and critical bursts.",
    },
  },
  ice: {
    level1: {
      damageMultiplier: 1.1,
      effects: [{ type: "slow", ratio: 0.3, duration: 1.5 }],
      summary: "Slows enemies on hit.",
    },
    level2: {
      damageMultiplier: 1.18,
      effects: [
        { type: "stunChance", chance: 0.15, duration: 1.2 },
        { type: "auraSlow", ratio: 0.15, radiusTiles: 2.5 },
      ],
      summary: "Adds stun chance and a slowing aura.",
    },
    level3: {
      damageMultiplier: 1.23,
      effects: [
        { type: "doubleDamageVsFrozen" },
        { type: "auraVulnerability", ratio: 0.25 },
      ],
      summary: "Double damage vs frozen, vulnerability aura.",
    },
  },
  lightning: {
    level1: {
      damageMultiplier: 1.15,
      effects: [{ type: "chain", targets: 2 }],
      summary: "Chains to a nearby enemy.",
    },
    level2: {
      damageMultiplier: 1.18,
      rangeMultiplier: 1.2,
      effects: [{ type: "chain", targets: 4 }],
      summary: "Chains to four enemies and gains range.",
    },
    level3: {
      damageMultiplier: 1.18,
      effects: [{ type: "chainNoDecay" }, { type: "burstAllInRange" }],
      summary: "Chains never decay and burst all enemies in range.",
    },
  },
  nature: {
    level1: {
      damageMultiplier: 1.15,
      effects: [{ type: "poison", dpsFactor: 0.6, duration: 4 }],
      summary: "Applies long poison DoT.",
    },
    level2: {
      damageMultiplier: 1.22,
      effects: [
        { type: "poisonSpreadOnDeath" },
        { type: "rootChance", chance: 0.1, duration: 1.5 },
      ],
      summary: "Poison spreads on death and roots enemies.",
    },
    level3: {
      damageMultiplier: 1.21,
      effects: [
        { type: "poisonInfiniteStack" },
        { type: "bonusDamageVsRooted", ratio: 0.5 },
      ],
      summary: "Poison stacks endlessly, +50% damage vs rooted.",
    },
  },
  earth: {
    level1: {
      damageMultiplier: 1.1,
      effects: [{ type: "splash", radiusTiles: 1.2, ratio: 0.75 }],
      summary: "Heavy splash damage.",
    },
    level2: {
      damageMultiplier: 1.36,
      effects: [{ type: "knockback", distanceTiles: 0.3 }],
      summary: "Higher damage and knockback.",
    },
    level3: {
      damageMultiplier: 1.27,
      effects: [
        { type: "aoeStun", duration: 0.8 },
        { type: "chainKnockbackSlow", ratio: 0.2, duration: 1.2 },
      ],
      summary: "AoE stun and chain knockback slow.",
    },
  },
  dark: {
    level1: {
      damageMultiplier: 1.15,
      effects: [{ type: "curse", ratio: 0.15, duration: 4 }],
      summary: "Curses enemies to take more damage.",
    },
    level2: {
      damageMultiplier: 1.18,
      effects: [
        { type: "drain", ratio: 0.2 },
        { type: "weakening", ratio: 0.25, duration: 3 },
      ],
      summary: "Drains lives and weakens enemy speed.",
    },
    level3: {
      damageMultiplier: 1.18,
      effects: [{ type: "overhealShield" }, { type: "curseSpread" }],
      summary: "Overheal shield and spreading curse.",
    },
  },
  holy: {
    level1: {
      damageMultiplier: 1.2,
      effects: [{ type: "bonusVsDark", ratio: 0.5 }],
      summary: "+50% damage vs dark enemies.",
    },
    level2: {
      damageMultiplier: 1.21,
      effects: [
        { type: "towerAuraSpeed", ratio: 0.2, radiusTiles: 2.5 },
        { type: "trueDamageEveryHits", every: 4 },
      ],
      summary: "Speed aura and periodic true damage.",
    },
    level3: {
      damageMultiplier: 1.21,
      effects: [
        { type: "towerAuraRange", ratio: 0.15 },
        { type: "smiteBeamTargets", targets: 3 },
      ],
      summary: "Range aura and smite beam.",
    },
  },
  archer: {
    level1: {
      damageMultiplier: 1.1,
      cooldownMultiplier: 0.75,
      summary: "Faster shots and more damage.",
    },
    level2: {
      damageMultiplier: 1.22,
      rangeMultiplier: 1.25,
      effects: [{ type: "crit", chance: 0.25, multiplier: 2 }],
      summary: "Greater range and crit chance.",
    },
    level3: {
      damageMultiplier: 1.22,
      effects: [
        { type: "headshotThreshold", hpThreshold: 0.15 },
        { type: "volleyPierce", arrows: 5, pierce: 2 },
      ],
      summary: "Execute low-HP enemies and pierce volley.",
    },
  },
};

export const upgradeMeta = {
  level1: { label: "Level 1", cost: () => getTowerTierCost(1) },
  level2: { label: "Level 2", cost: () => getTowerTierCost(2) },
  level3: { label: "Level 3", cost: () => getTowerTierCost(3) },
};

export const enemyRoleModifiers = {
  normal: { hp: 1.0, speed: 1.0, count: 1.0 },
  fast: { hp: 0.6, speed: 1.6, count: 1.0 },
  tank: { hp: 2.2, speed: 0.6, count: 1.0 },
  swarm: { hp: 0.35, speed: 1.0, count: 2.0 },
  elite: { hp: 3.95, speed: 0.8, count: 1.0 },
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
  { role: "elite", secondaryRole: "fast", breather: true, expectedTowerCount: 9, expectedDpsBand: [188, 248] },
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
  const currentTier = Math.max(0, Math.min(MAX_TOWER_LEVEL, tower.tier ?? 0));
  if (currentTier >= MAX_TOWER_LEVEL) {
    return [];
  }
  const id = UPGRADE_PATH[currentTier];
  const nextTier = currentTier + 1;
  return [
    {
      id,
      tier: nextTier,
      path: null,
      label: upgradeMeta[id]?.label ?? `Level ${nextTier}`,
      cost: upgradeMeta[id]?.cost?.() ?? economy.baseTowerCost,
      summary: upgrades[tower.type]?.[id]?.summary ?? "",
    },
  ];
}

export function isValidConversionTarget(towerType) {
  return ELEMENT_CONVERSIONS.includes(towerType);
}

export function getTowerDisplayName(towerType) {
  const label = towerCatalog[towerType]?.label ?? towerCatalog.basic.label;
  return `${label} Tower`;
}

export function getTowerDescription(towerType) {
  return towerUiMeta[towerType]?.description ?? towerUiMeta.basic.description;
}

export function getTowerTooltipSummary(towerType) {
  const tower = towerCatalog[towerType] ?? towerCatalog.basic;
  const damage = Number.isFinite(tower.damage) ? tower.damage : towerCatalog.basic.damage;
  const rate = Number.isFinite(tower.rate) ? tower.rate : towerCatalog.basic.rate;
  const rangeTiles = Number.isFinite(tower.rangeTiles) ? tower.rangeTiles : towerCatalog.basic.rangeTiles;
  const cooldown = rate > 0 ? 1 / rate : 1;
  const { effectiveDps, isUtilityLimited } = getTowerEffectiveDps(towerType, damage, cooldown);
  const dpsLabel = effectiveDps >= 10 ? effectiveDps.toFixed(1) : effectiveDps.toFixed(2);
  const baseLine = `Damage ${damage} | Rate ${rate.toFixed(1)}/s | Range ${rangeTiles.toFixed(1)} tiles | Effective DPS ${dpsLabel}`;
  if (isUtilityLimited) {
    return `${baseLine}\nUtility-limited (cap from balance budget)`;
  }
  return baseLine;
}

export function getTowerTextureKey(towerType) {
  return towerVisuals[towerType]?.textureKey ?? towerVisuals.basic.textureKey;
}

export function getTowerEffectShortSummary(effects = []) {
  if (!Array.isArray(effects) || effects.length === 0) {
    return "No special effects";
  }
  const labels = [];
  for (const effect of effects) {
    const type = effect?.type;
    if (type === "burn") labels.push("Burn");
    else if (type === "poison") labels.push("Poison");
    else if (type === "slow") labels.push("Slow");
    else if (type === "stunChance") labels.push("Stun chance");
    else if (type === "rootChance") labels.push("Root chance");
    else if (type === "chain") labels.push("Chain");
    else if (type === "chainNoDecay") labels.push("Full chain");
    else if (type === "splash") labels.push("Splash");
    else if (type === "crit") labels.push("Crit");
    else if (type === "towerAuraSpeed") labels.push("Speed aura");
    else if (type === "towerAuraRange") labels.push("Range aura");
    else if (type === "curse") labels.push("Curse");
    else if (type === "drain") labels.push("Drain");
    else if (type === "knockback") labels.push("Knockback");
    else if (type === "smiteBeamTargets") labels.push("Smite");
    else if (type === "volley" || type === "volleyPierce") labels.push("Volley");
  }
  const unique = [...new Set(labels)];
  if (unique.length === 0) {
    return "No special effects";
  }
  if (unique.length <= 3) {
    return unique.join(" | ");
  }
  return `${unique.slice(0, 3).join(" | ")} +${unique.length - 3}`;
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

export function getTowerEffectiveDps(towerType, damage, cooldownSeconds) {
  const safeDamage = Number.isFinite(damage) ? damage : 0;
  const cd = Math.max(Number.isFinite(cooldownSeconds) ? cooldownSeconds : 0.5, 0.01);
  const rawDps = safeDamage / cd;
  const cappedDamage = clampUtilityBudget(towerType, safeDamage, cd);
  const effectiveDps = cappedDamage / cd;
  const isUtilityLimited = rawDps - effectiveDps > 0.05;
  return { rawDps, effectiveDps, isUtilityLimited };
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
