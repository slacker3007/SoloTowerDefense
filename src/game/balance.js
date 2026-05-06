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
  fire: { label: "Fire", damage: 7, rate: 0.52, rangeTiles: 3.5, utilityBudget: 0.72, projectileSpeed: 440 },
  ice: { label: "Ice", damage: 5, rate: 0.62, rangeTiles: 3.5, utilityBudget: 0.72, projectileSpeed: 410 },
  lightning: { label: "Lightning", damage: 9, rate: 1.05, rangeTiles: 3.1, utilityBudget: 0.8, projectileSpeed: 500 },
  nature: { label: "Nature", damage: 5, rate: 0.72, rangeTiles: 3.5, utilityBudget: 0.76, projectileSpeed: 420 },
  earth: { label: "Earth", damage: 40, rate: 0.3, rangeTiles: 2.85, utilityBudget: 0.76, projectileSpeed: 340 },
  dark: { label: "Dark", damage: 4, rate: 0.52, rangeTiles: 3.2, utilityBudget: 0.74, projectileSpeed: 420 },
  holy: { label: "Holy", damage: 7, rate: 0.55, rangeTiles: 3.5, utilityBudget: 0.82, projectileSpeed: 450 },
  archer: { label: "Archer", damage: 12, rate: 1.35, rangeTiles: 3.85, utilityBudget: 1.0, projectileSpeed: 500 },
};

/** Tier-0 effects applied on elemental conversion (and should match tower identity). */
export const towerBaseEffects = {
  archer: [],
  fire: [
    { type: "splash", radiusTiles: 1.35, ratio: 0.58 },
    { type: "burn", dpsFactor: 0.32, duration: 2.5 },
  ],
  ice: [
    { type: "slow", ratio: 0.48, duration: 2.2 },
    { type: "stunChance", chance: 0.12, duration: 0.85, asFreeze: true },
  ],
  lightning: [{ type: "chain", targets: 4 }],
  nature: [{ type: "bonusGoldPerKill", amount: 2 }],
  earth: [{ type: "bonusVsHeavy", ratio: 0.52 }],
  dark: [{ type: "curse", ratio: 0.24, duration: 5 }],
  holy: [{ type: "pulseAoE", interval: 2.0, damageRatio: 0.42 }],
};

export const towerUiMeta = {
  basic: {
    description: "Balanced starter tower with steady damage and reliable range.",
  },
  fire: {
    description: "Area damage and burn—punishes clusters, not single-target DPS.",
  },
  ice: {
    description: "Strong slow and freeze—keeps enemies in range longer for all towers.",
  },
  lightning: {
    description: "Chaining bolts with falloff—efficient burst across several targets.",
  },
  nature: {
    description: "Economy tower—bonus gold per kill; poison and roots from upgrades.",
  },
  earth: {
    description: "Slow, heavy shots—extra damage vs tanks, elites, and armored foes.",
  },
  dark: {
    description: "Curse and weaken—amplifies damage everyone else deals.",
  },
  holy: {
    description: "Periodic pulse damage in range—supportive wave chip and auras later.",
  },
  archer: {
    description: "Pure single-target DPS benchmark—fast, long-range, no utility cap.",
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
  freeze: { tint: 0xa8e8ff, ring: 0x4db8e8 },
  root: { tint: 0x9ed18d, ring: 0x3a8a3a },
  curse: { tint: 0xc7a5ff, ring: 0x7d3ad3 },
  weakening: { tint: 0xb59bd9, ring: 0x6b4dab },
  vulnerability: { tint: 0xff9bb4, ring: 0xd84a7a },
};

export const STATUS_PRIORITY = ["stun", "freeze", "root", "burn", "poison", "vulnerability", "slow", "curse", "weakening"];

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
      damageMultiplier: 1.22,
      effects: [{ type: "burn", dpsFactor: 0.48, duration: 3.2 }],
      summary: "Stronger burn and damage (splash already built-in).",
    },
    level2: {
      damageMultiplier: 1.18,
      effects: [
        { type: "burnStacking", maxStacks: 3, duration: 5 },
        { type: "splash", radiusTiles: 1.65, ratio: 0.62 },
      ],
      summary: "Wider splash, stacking burns.",
    },
    level3: {
      damageMultiplier: 1.2,
      effects: [
        { type: "deathExplosionBurn" },
        { type: "critExplosion", chance: 0.2, multiplier: 2 },
      ],
      summary: "Death firebursts and crit splashes.",
    },
  },
  ice: {
    level1: {
      damageMultiplier: 1.12,
      effects: [{ type: "auraSlow", ratio: 0.16, radiusTiles: 2.4 }],
      summary: "Slowing aura—control without replacing your main slow.",
    },
    level2: {
      damageMultiplier: 1.16,
      effects: [
        { type: "stunChance", chance: 0.18, duration: 1.05, asFreeze: true },
        { type: "auraSlow", ratio: 0.08, radiusTiles: 2.6 },
      ],
      summary: "Higher freeze chance and stronger aura.",
    },
    level3: {
      damageMultiplier: 1.22,
      effects: [
        { type: "doubleDamageVsFrozen" },
        { type: "auraVulnerability", ratio: 0.25 },
      ],
      summary: "Double damage vs frozen; vulnerability aura.",
    },
  },
  lightning: {
    level1: {
      damageMultiplier: 1.16,
      summary: "Harder hits (chain is built-in).",
    },
    level2: {
      damageMultiplier: 1.14,
      rangeMultiplier: 1.18,
      effects: [{ type: "chain", targets: 5 }],
      summary: "Fifth chain target and more range.",
    },
    level3: {
      damageMultiplier: 1.16,
      effects: [{ type: "chainNoDecay" }, { type: "burstAllInRange" }],
      summary: "Chains without falloff; periodic full-range burst.",
    },
  },
  nature: {
    level1: {
      damageMultiplier: 1.12,
      effects: [
        { type: "bonusGoldPerKill", amount: 1 },
        { type: "poison", dpsFactor: 0.55, duration: 4 },
      ],
      summary: "+1 more gold per kill and poison DoT.",
    },
    level2: {
      damageMultiplier: 1.18,
      effects: [
        { type: "poisonSpreadOnDeath" },
        { type: "rootChance", chance: 0.1, duration: 1.5 },
      ],
      summary: "Poison spreads on death; chance to root.",
    },
    level3: {
      damageMultiplier: 1.2,
      effects: [
        { type: "poisonInfiniteStack" },
        { type: "bonusDamageVsRooted", ratio: 0.5 },
      ],
      summary: "Infinite poison stacks; +50% vs rooted.",
    },
  },
  earth: {
    level1: {
      damageMultiplier: 1.12,
      effects: [{ type: "splash", radiusTiles: 0.95, ratio: 0.45 }],
      summary: "Minor splash for packed lanes (tank-bust stays primary).",
    },
    level2: {
      damageMultiplier: 1.32,
      effects: [{ type: "knockback", distanceTiles: 0.35 }],
      summary: "More per-hit damage and knockback.",
    },
    level3: {
      damageMultiplier: 1.25,
      effects: [
        { type: "aoeStun", duration: 0.8 },
        { type: "chainKnockbackSlow", ratio: 0.2, duration: 1.2 },
      ],
      summary: "Impact stun and chained slows.",
    },
  },
  dark: {
    level1: {
      damageMultiplier: 1.18,
      effects: [{ type: "weakening", ratio: 0.18, duration: 3.5 }],
      summary: "Weaken movement—curse already built-in.",
    },
    level2: {
      damageMultiplier: 1.16,
      effects: [
        { type: "drain", ratio: 0.2 },
        { type: "weakening", ratio: 0.12, duration: 3 },
      ],
      summary: "Life drain and extra weaken.",
    },
    level3: {
      damageMultiplier: 1.18,
      effects: [{ type: "overhealShield" }, { type: "curseSpread" }],
      summary: "Overheal shield and spreading curse.",
    },
  },
  holy: {
    level1: {
      damageMultiplier: 1.15,
      effects: [{ type: "bonusVsDark", ratio: 0.5 }],
      summary: "+50% damage vs dark-tagged enemies.",
    },
    level2: {
      damageMultiplier: 1.18,
      effects: [
        { type: "towerAuraSpeed", ratio: 0.15, radiusTiles: 2.5 },
        { type: "trueDamageEveryHits", every: 4 },
      ],
      summary: "Allied tower speed aura; periodic true damage on shots.",
    },
    level3: {
      damageMultiplier: 1.18,
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

export const enemyArchetypes = {
  grunt: { role: "normal", hpMultiplier: 1.0, speedMultiplier: 1.0, rewardMultiplier: 1.0, tags: [] },
  runner: { role: "fast", hpMultiplier: 0.7, speedMultiplier: 1.65, rewardMultiplier: 1.0, tags: [] },
  brute: { role: "tank", hpMultiplier: 2.4, speedMultiplier: 0.58, rewardMultiplier: 1.3, tags: ["armor", "tank"] },
  swarm: { role: "swarm", hpMultiplier: 0.42, speedMultiplier: 1.06, rewardMultiplier: 0.85, tags: [] },
  linkedPack: { role: "fast", hpMultiplier: 0.85, speedMultiplier: 1.35, rewardMultiplier: 1.1, tags: ["linkedPack"] },
  hoarder: { role: "normal", hpMultiplier: 1.05, speedMultiplier: 1.12, rewardMultiplier: 1.0, tags: ["hoarder"], bonusGoldOnKill: 6 },
  shieldedMage: {
    role: "elite",
    hpMultiplier: 1.05,
    speedMultiplier: 0.9,
    rewardMultiplier: 1.2,
    tags: ["shielded"],
    shieldHpMultiplier: 0.55,
  },
  regenerator: {
    role: "tank",
    hpMultiplier: 1.85,
    speedMultiplier: 0.75,
    rewardMultiplier: 1.2,
    tags: ["regenerator"],
    regenPerSecondMultiplier: 0.03,
  },
  splitter: {
    role: "normal",
    hpMultiplier: 1.1,
    speedMultiplier: 1.0,
    rewardMultiplier: 1.05,
    tags: ["splitter"],
    splitOnDeath: { childType: "swarm", count: 2 },
  },
  fireResistSwarm: {
    role: "swarm",
    hpMultiplier: 0.48,
    speedMultiplier: 1.08,
    rewardMultiplier: 0.9,
    tags: ["fireResist"],
  },
  slowImmuneRunner: {
    role: "fast",
    hpMultiplier: 0.8,
    speedMultiplier: 1.75,
    rewardMultiplier: 1.1,
    tags: ["slowResist", "slowImmune"],
  },
  siegeGolem: {
    role: "elite",
    hpMultiplier: 7.5,
    speedMultiplier: 0.45,
    rewardMultiplier: 3.0,
    tags: ["boss", "armor", "tank"],
    spawnOnThresholds: [
      { threshold: 0.75, type: "swarm", count: 2 },
      { threshold: 0.5, type: "swarm", count: 2 },
      { threshold: 0.25, type: "swarm", count: 2 },
    ],
  },
};

export const scriptedWaveProgram = [
  { phase: "foundation", role: "normal", packs: [{ type: "grunt", count: 8 }] },
  { phase: "foundation", role: "normal", packs: [{ type: "grunt", count: 12, speedMultiplier: 1.08 }] },
  {
    phase: "foundation",
    role: "fast",
    packs: [
      { type: "grunt", count: 8 },
      { type: "runner", count: 4 },
    ],
  },
  { phase: "foundation", role: "swarm", packs: [{ type: "grunt", count: 16 }] },
  {
    phase: "foundation",
    role: "swarm",
    packs: [
      { type: "grunt", count: 12 },
      { type: "swarm", count: 8 },
    ],
  },
  {
    phase: "roleIntro",
    role: "tank",
    packs: [
      { type: "brute", count: 4 },
      { type: "grunt", count: 6 },
    ],
  },
  {
    phase: "roleIntro",
    role: "fast",
    packs: [
      { type: "runner", count: 10 },
      { type: "grunt", count: 6 },
    ],
  },
  {
    phase: "roleIntro",
    role: "fast",
    packs: [
      { type: "linkedPack", count: 8 },
      { type: "runner", count: 4 },
    ],
  },
  {
    phase: "roleIntro",
    role: "mixed",
    packs: [
      { type: "brute", count: 2 },
      { type: "swarm", count: 10 },
      { type: "runner", count: 4 },
    ],
  },
  {
    phase: "roleIntro",
    role: "economy",
    packs: [
      { type: "hoarder", count: 6 },
      { type: "grunt", count: 8 },
    ],
  },
  {
    phase: "synergy",
    role: "elite",
    packs: [
      { type: "shieldedMage", count: 6 },
      { type: "grunt", count: 6 },
    ],
  },
  {
    phase: "synergy",
    role: "tank",
    packs: [
      { type: "regenerator", count: 4 },
      { type: "swarm", count: 8 },
    ],
  },
  {
    phase: "synergy",
    role: "mixed",
    packs: [
      { type: "splitter", count: 6 },
      { type: "runner", count: 6 },
    ],
  },
  {
    phase: "synergy",
    role: "mixed",
    packs: [
      { type: "brute", count: 2 },
      { type: "swarm", count: 6 },
      { type: "shieldedMage", count: 4 },
      { type: "runner", count: 4 },
    ],
  },
  {
    phase: "synergy",
    role: "mixed",
    packs: [
      { type: "brute", count: 3 },
      { type: "shieldedMage", count: 3 },
      { type: "swarm", count: 6 },
      { type: "runner", count: 4 },
    ],
  },
  {
    phase: "punishment",
    role: "swarm",
    packs: [
      { type: "fireResistSwarm", count: 6 },
      { type: "brute", count: 4 },
    ],
  },
  {
    phase: "punishment",
    role: "fast",
    packs: [
      { type: "slowImmuneRunner", count: 6 },
      { type: "shieldedMage", count: 6 },
    ],
  },
  {
    phase: "punishment",
    role: "economy",
    interval: 0.62,
    packs: [
      { type: "hoarder", count: 8 },
      { type: "splitter", count: 6 },
    ],
  },
  {
    phase: "punishment",
    role: "mixed",
    packs: [
      { type: "brute", count: 2 },
      { type: "runner", count: 6 },
      { type: "swarm", count: 6 },
      { type: "shieldedMage", count: 4 },
      { type: "regenerator", count: 2 },
    ],
  },
  {
    phase: "punishment",
    role: "boss",
    maxAlive: 18,
    packs: [
      { type: "siegeGolem", count: 1 },
      { type: "runner", count: 6 },
      { type: "swarm", count: 6 },
    ],
  },
];

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
    else if (type === "stunChance") labels.push(effect.asFreeze ? "Freeze chance" : "Stun chance");
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
    else if (type === "bonusGoldPerKill") labels.push(`+${effect.amount ?? 0}g/kill`);
    else if (type === "bonusVsHeavy") labels.push("Vs heavy");
    else if (type === "pulseAoE") labels.push("Pulse");
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

/**
 * Deep-clone tier-0 effect definitions for a new tower instance.
 * @param {string} towerType
 * @returns {object[]}
 */
export function getTowerBaseEffects(towerType) {
  const list = towerBaseEffects[towerType];
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  return list.map((entry) => ({ ...entry }));
}

/**
 * Largest splash radius among splash effects (tiles), or 0 if none.
 * @param {object[]} effects
 */
export function getMaxSplashRadiusTilesFromEffects(effects = []) {
  let maxR = 0;
  for (const effect of effects) {
    if (effect?.type === "splash" && Number.isFinite(effect.radiusTiles)) {
      maxR = Math.max(maxR, effect.radiusTiles);
    }
  }
  return maxR;
}

/**
 * @param {object[]} effects
 * @returns {{ maxTargets: number, noDecay: boolean }}
 */
export function getMergedChainInfoFromEffects(effects = []) {
  let maxTargets = 0;
  let noDecay = false;
  for (const effect of effects) {
    if (effect?.type === "chainNoDecay") {
      noDecay = true;
      maxTargets = Math.max(maxTargets, MAX_CHAIN_TARGETS);
    } else if (effect?.type === "chain" && Number.isFinite(effect.targets)) {
      maxTargets = Math.max(maxTargets, effect.targets);
    }
  }
  return { maxTargets, noDecay };
}

/**
 * HUD copy that leads with tower role, not raw DPS (except archer/baseline).
 * @param {string} towerType
 * @param {object[]} effects
 * @param {number} damage
 * @param {number} cooldownSeconds
 */
export function getTowerRoleHudModel(towerType, effects = [], damage = 0, cooldownSeconds = 1) {
  const list = Array.isArray(effects) ? effects : [];
  const { effectiveDps, isUtilityLimited } = getTowerEffectiveDps(towerType, damage, cooldownSeconds);
  const dpsStr = effectiveDps >= 10 ? effectiveDps.toFixed(1) : effectiveDps.toFixed(2);

  const slowFx = list.filter((e) => e?.type === "slow");
  const maxSlow = slowFx.length ? Math.max(...slowFx.map((s) => (Number.isFinite(s.ratio) ? s.ratio : 0))) : 0;
  const freezeFx = list.filter((e) => e?.type === "stunChance" && e.asFreeze);
  const freezeChance = freezeFx.length ? Math.max(...freezeFx.map((f) => (Number.isFinite(f.chance) ? f.chance : 0))) : 0;

  const splashR = getMaxSplashRadiusTilesFromEffects(list);
  const chainInfo = getMergedChainInfoFromEffects(list);
  const goldBonus = list
    .filter((e) => e?.type === "bonusGoldPerKill")
    .reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
  const heavy = list.find((e) => e?.type === "bonusVsHeavy");
  const curse = list.find((e) => e?.type === "curse");
  const pulse = list.find((e) => e?.type === "pulseAoE");

  let primaryLine = "";
  let dpsLine = "";
  let dpsProminent = true;
  let showUtilityWarning = isUtilityLimited;

  if (towerType === "basic") {
    primaryLine = "Balanced starter";
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = true;
    showUtilityWarning = false;
  } else if (towerType === "archer") {
    primaryLine = "Pure single-target DPS (baseline)";
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = true;
    showUtilityWarning = false;
  } else if (towerType === "fire") {
    primaryLine =
      splashR > 0 ? `🔥 Hits multiple enemies · splash ${splashR.toFixed(2)} tiles` : "🔥 Area damage / wave clear";
    dpsLine = `Direct hit DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "ice") {
    const slowPct = Math.round(maxSlow * 100);
    const frz = Math.round(freezeChance * 100);
    primaryLine = frz > 0 ? `❄ Slow: ${slowPct}%  ·  Freeze: ${frz}%` : `❄ Slow: ${slowPct}%`;
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "lightning") {
    const cap = MAX_CHAIN_TARGETS;
    const n = chainInfo.noDecay ? cap : Math.max(1, Math.min(chainInfo.maxTargets || 1, cap));
    primaryLine = chainInfo.noDecay
      ? `⚡ Chains to ${n} enemies (no falloff)`
      : `⚡ Chains to ${n} enemies (damage falloff)`;
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "nature") {
    primaryLine = goldBonus > 0 ? `🌿 +${goldBonus}g per kill` : "🌿 Economy tower";
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "earth") {
    const pct = heavy && Number.isFinite(heavy.ratio) ? Math.round(heavy.ratio * 100) : 0;
    primaryLine = pct > 0 ? `🪨 +${pct}% vs heavy enemies` : "🪨 Tank buster";
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "dark") {
    const pct = curse && Number.isFinite(curse.ratio) ? Math.round(curse.ratio * 100) : 0;
    primaryLine = pct > 0 ? `🌑 Enemies take +${pct}% damage` : "🌑 Curse support";
    dpsLine = `DPS: ${dpsStr}`;
    dpsProminent = false;
  } else if (towerType === "holy") {
    const iv = pulse && Number.isFinite(pulse.interval) ? pulse.interval : 2;
    const dr = pulse && Number.isFinite(pulse.damageRatio) ? Math.round(pulse.damageRatio * 100) : 42;
    primaryLine = `✨ Pulse ${iv.toFixed(1)}s · ${dr}% tower damage in range`;
    dpsLine = `Shot DPS: ${dpsStr}`;
    dpsProminent = false;
  } else {
    dpsLine = `DPS: ${dpsStr}`;
  }

  if (towerType !== "archer" && towerType !== "basic") {
    showUtilityWarning = isUtilityLimited;
  }

  return {
    primaryLine,
    dpsLine,
    dpsProminent,
    showUtilityWarning,
  };
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

export function getScriptedWave(waveIndex) {
  return scriptedWaveProgram[Math.max(0, Math.min(scriptedWaveProgram.length - 1, waveIndex - 1))] ?? null;
}

export function getEnemyArchetype(type) {
  return enemyArchetypes[type] ?? enemyArchetypes.grunt;
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
