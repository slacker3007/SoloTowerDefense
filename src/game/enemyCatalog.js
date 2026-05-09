/**
 * Design-time enemy catalog. HP / speed / gold are ratios vs grunt baseline (100 / 1.0 / 3).
 * Compiled into runtime archetypes consumed by WaveSystem / getEnemyArchetype.
 */
const REF_HP = 100;
const REF_SPEED = 1;
const REF_GOLD = 3;

/** @typedef {{ type: string } & Record<string, unknown>} EnemyAbility */

/**
 * @param {EnemyAbility[]} abilities
 * @param {Set<string>} tags
 * @returns {Record<string, unknown>}
 */
function compileAbilityFields(abilities, tags) {
  let evasionChance = 0;
  let flatDamageReduction = 0;
  let fireHitDamageMultiplier = 1;
  let postShieldDamageMultiplier = 1;
  let slowEffectivenessMultiplier = 1;
  let chainVulnerabilityMultiplier = 1;
  let damageTakenMultiplier = 1;
  let earlyKillHpThreshold = null;
  let earlyKillBonusGold = 0;
  let stompAuraRadiusTiles = 0;
  const stompAuraInterval = 2.4;

  for (const a of abilities ?? []) {
    if (!a || typeof a.type !== "string") {
      continue;
    }
    switch (a.type) {
      case "evasion":
        evasionChance = Math.max(0, Math.min(1, Number(a.chance) || 0));
        break;
      case "slowResistance":
        slowEffectivenessMultiplier = Math.max(0, Math.min(1, Number(a.multiplier) ?? 1));
        tags.add("slowResistPartial");
        break;
      case "resistance":
        if (a.damageType === "fire") {
          tags.add("fireResist");
          fireHitDamageMultiplier = Math.max(0, Math.min(1, Number(a.multiplier) ?? 1));
        }
        break;
      case "flatDamageReduction":
        flatDamageReduction = Math.max(0, Number(a.amount) || 0);
        break;
      case "damageShield":
        postShieldDamageMultiplier = Math.max(0, Math.min(1, Number(a.reduction) ?? 1));
        break;
      case "chainConductive":
        chainVulnerabilityMultiplier = 1 + Math.max(0, Number(a.bonusDamageTaken) || 0);
        break;
      case "damageResistance":
        damageTakenMultiplier = Math.max(0, Math.min(1, Number(a.multiplier) ?? 1));
        break;
      case "bonusReward":
        earlyKillHpThreshold = Math.max(0, Math.min(1, Number(a.thresholdPercent) ?? 0.6));
        earlyKillBonusGold = Math.max(0, Number(a.extraGoldIfKilledEarly) || 0);
        break;
      case "stompAura":
        stompAuraRadiusTiles = Math.max(0, Number(a.radius) || 0);
        break;
      default:
        break;
    }
  }

  return {
    evasionChance,
    flatDamageReduction,
    fireHitDamageMultiplier,
    postShieldDamageMultiplier,
    slowEffectivenessMultiplier,
    chainVulnerabilityMultiplier,
    damageTakenMultiplier,
    earlyKillHpThreshold,
    earlyKillBonusGold,
    stompAuraRadiusTiles,
    stompAuraInterval,
  };
}

function parseWorldbreakerSpawnBlock(abilities) {
  const out = {
    spawnEnemy: "grunt",
    spawnAmount: 1,
    spawnInterval: 10,
    damageTakenMultiplier: 1,
    rageSpeed: 1,
  };
  for (const a of abilities ?? []) {
    if (a.type === "spawn") {
      out.spawnEnemy = typeof a.enemy === "string" ? a.enemy : out.spawnEnemy;
      out.spawnAmount = Math.max(1, Number(a.amount) || 1);
      out.spawnInterval = Math.max(0.5, Number(a.interval) || 10);
    } else if (a.type === "damageResistance") {
      out.damageTakenMultiplier = Math.max(0, Math.min(1, Number(a.multiplier) ?? 1));
    } else if (a.type === "rage") {
      out.rageSpeed = Math.max(1, Number(a.speedMultiplier) || 1);
    }
  }
  return out;
}

/** @param {{ abilities?: EnemyAbility[] }[]} catalogPhases */
function compileWorldbreakerBands(catalogPhases) {
  const p1 = parseWorldbreakerSpawnBlock(catalogPhases[0]?.abilities);
  const p2 = parseWorldbreakerSpawnBlock(catalogPhases[1]?.abilities);
  const p3 = parseWorldbreakerSpawnBlock(catalogPhases[2]?.abilities);
  return [
    { ...p1, damageTakenMultiplier: 1, rageSpeed: 1 },
    { ...p2, rageSpeed: 1 },
    { ...p2, rageSpeed: 1 },
    {
      spawnEnemy: p3.spawnEnemy,
      spawnAmount: p3.spawnAmount,
      spawnInterval: p3.spawnInterval,
      damageTakenMultiplier: p2.damageTakenMultiplier,
      rageSpeed: p3.rageSpeed,
    },
  ];
}

/**
 * @param {object} spec
 * @returns {object}
 */
function entry(spec) {
  const {
    key,
    name,
    role,
    designHp,
    designSpeed,
    designGold,
    description,
    abilities = [],
    tags: extraTags = [],
    shieldHpMultiplier,
    regenPerSecondMultiplier: explicitRegen,
    splitOnDeath,
    spawnOnThresholds,
    bonusGoldOnKill,
    bossPhaseBands: preBands,
  } = spec;

  const tags = new Set(extraTags);

  let merged = {
    hpMultiplier: designHp / REF_HP,
    speedMultiplier: designSpeed / REF_SPEED,
    rewardMultiplier: designGold / REF_GOLD,
    shieldHpMultiplier: shieldHpMultiplier ?? undefined,
    regenPerSecondMultiplier: explicitRegen,
    splitOnDeath: splitOnDeath ?? undefined,
    spawnOnThresholds: spawnOnThresholds ?? undefined,
    bonusGoldOnKill: bonusGoldOnKill ?? undefined,
  };

  for (const a of abilities) {
    if (a?.type === "spawnOnHealthThreshold") {
      const thresholds = Array.isArray(a.thresholds) ? a.thresholds : [];
      const spawn = a.spawn;
      const spawnType = Array.isArray(spawn) ? spawn[0] : null;
      const spawnCount = Array.isArray(spawn) ? Number(spawn[1]) : 0;
      if (spawnType && spawnCount > 0) {
        merged.spawnOnThresholds = thresholds
          .map((t) => ({ threshold: Number(t), type: spawnType, count: spawnCount }))
          .filter((e) => Number.isFinite(e.threshold));
      }
    }
    if (a?.type === "splitOnDeath") {
      const into = typeof a.into === "string" ? a.into : "swarm";
      const count = Math.max(1, Number(a.count) || 1);
      merged.splitOnDeath = { childType: into, count };
    }
    if (a?.type === "regen") {
      merged.regenPerSecondMultiplier = Math.max(0, Number(a.hpPercentPerSecond) || 0);
    }
  }

  const abilityExtras = compileAbilityFields(
    abilities.filter(
      (a) =>
        a &&
        !["spawnOnHealthThreshold", "splitOnDeath", "regen", "worldbreakerPhases"].includes(a.type),
    ),
    tags,
  );

  if (abilityExtras.chainVulnerabilityMultiplier > 1) {
    tags.add("linkedPack");
  }

  const wb = abilities.find((a) => a?.type === "worldbreakerPhases");
  if (wb && Array.isArray(wb.phases)) {
    merged.bossPhaseBands = compileWorldbreakerBands(wb.phases);
    merged.spawnOnThresholds = [];
  }

  if (preBands) {
    merged.bossPhaseBands = preBands;
  }

  Object.assign(merged, abilityExtras);
  if (merged.spawnOnThresholds === undefined || (Array.isArray(merged.spawnOnThresholds) && merged.spawnOnThresholds.length === 0)) {
    delete merged.spawnOnThresholds;
  }

  return {
    key,
    name,
    description,
    designHp,
    designSpeed,
    designGold,
    abilities,
    runtime: {
      role,
      hpMultiplier: merged.hpMultiplier,
      speedMultiplier: merged.speedMultiplier,
      rewardMultiplier: merged.rewardMultiplier,
      tags: [...tags],
      shieldHpMultiplier: merged.shieldHpMultiplier,
      regenPerSecondMultiplier: merged.regenPerSecondMultiplier,
      splitOnDeath: merged.splitOnDeath,
      spawnOnThresholds: merged.spawnOnThresholds,
      bonusGoldOnKill: merged.bonusGoldOnKill,
      evasionChance: merged.evasionChance ?? 0,
      flatDamageReduction: merged.flatDamageReduction ?? 0,
      fireHitDamageMultiplier: merged.fireHitDamageMultiplier ?? 1,
      postShieldDamageMultiplier: merged.postShieldDamageMultiplier ?? 1,
      slowEffectivenessMultiplier: merged.slowEffectivenessMultiplier ?? 1,
      chainVulnerabilityMultiplier: merged.chainVulnerabilityMultiplier ?? 1,
      damageTakenMultiplier: merged.damageTakenMultiplier ?? 1,
      earlyKillHpThreshold: merged.earlyKillHpThreshold ?? null,
      earlyKillBonusGold: merged.earlyKillBonusGold ?? 0,
      stompAuraRadiusTiles: merged.stompAuraRadiusTiles ?? 0,
      stompAuraInterval: merged.stompAuraInterval ?? 2.4,
      bossPhaseBands: merged.bossPhaseBands ?? null,
    },
  };
}

const catalogEntries = [
  entry({
    key: "grunt",
    name: "Grunt",
    role: "normal",
    designHp: 100,
    designSpeed: 1.0,
    designGold: 3,
    description: "Standard enemy. Used as baseline for balancing.",
    abilities: [],
  }),
  entry({
    key: "runner",
    name: "Runner",
    role: "fast",
    designHp: 55,
    designSpeed: 2.2,
    designGold: 4,
    description: "Fast enemy designed to pressure slow towers and reward Ice control.",
    abilities: [{ type: "evasion", chance: 0.1 }],
  }),
  entry({
    key: "swift_runner",
    name: "Swift Runner",
    role: "fast",
    designHp: 80,
    designSpeed: 2.8,
    designGold: 5,
    description: "Advanced runner resistant to crowd control.",
    abilities: [
      { type: "slowResistance", multiplier: 0.5 },
      { type: "evasion", chance: 0.15 },
    ],
  }),
  entry({
    key: "swarm",
    name: "Swarmling",
    role: "swarm",
    designHp: 28,
    designSpeed: 1.4,
    designGold: 1,
    description: "Weak individually but dangerous in groups. Designed for Fire and Holy.",
    abilities: [],
  }),
  entry({
    key: "fire_swarm",
    name: "Ember Swarm",
    role: "swarm",
    designHp: 40,
    designSpeed: 1.5,
    designGold: 2,
    description: "Swarm unit resistant to Fire damage.",
    abilities: [{ type: "resistance", damageType: "fire", multiplier: 0.4 }],
  }),
  entry({
    key: "brute",
    name: "Brute",
    role: "tank",
    designHp: 850,
    designSpeed: 0.55,
    designGold: 10,
    description: "Heavy armored unit designed to punish rapid low-damage attacks.",
    tags: ["armor", "tank"],
    abilities: [{ type: "flatDamageReduction", amount: 4 }],
  }),
  entry({
    key: "linked",
    name: "Linked Construct",
    role: "fast",
    designHp: 180,
    designSpeed: 1.0,
    designGold: 5,
    description: "Conductive enemy vulnerable to Lightning chains.",
    abilities: [{ type: "chainConductive", bonusDamageTaken: 0.5 }],
  }),
  entry({
    key: "shielded",
    name: "Shielded Mage",
    role: "elite",
    designHp: 320,
    designSpeed: 0.9,
    designGold: 8,
    description: "Magical barrier reduces incoming damage heavily.",
    tags: ["shielded"],
    abilities: [{ type: "damageShield", reduction: 0.5 }],
    shieldHpMultiplier: 0.35,
  }),
  entry({
    key: "regenerator",
    name: "Regenerator",
    role: "tank",
    designHp: 450,
    designSpeed: 0.8,
    designGold: 8,
    description: "Rapidly regenerates health unless burst down.",
    tags: ["regenerator"],
    abilities: [{ type: "regen", hpPercentPerSecond: 0.04 }],
  }),
  entry({
    key: "splitter",
    name: "Splitter",
    role: "normal",
    designHp: 260,
    designSpeed: 1.0,
    designGold: 6,
    description: "Splits into multiple smaller enemies on death.",
    tags: ["splitter"],
    abilities: [{ type: "splitOnDeath", into: "swarm", count: 3 }],
  }),
  entry({
    key: "hoarder",
    name: "Hoarder",
    role: "normal",
    designHp: 120,
    designSpeed: 1.4,
    designGold: 12,
    description: "Valuable target rewarding aggressive builds.",
    tags: ["hoarder"],
    abilities: [{ type: "bonusReward", extraGoldIfKilledEarly: 5, thresholdPercent: 0.6 }],
  }),
  entry({
    key: "siege_golem",
    name: "Siege Golem",
    role: "elite",
    designHp: 4500,
    designSpeed: 0.35,
    designGold: 40,
    description: "Heavy siege unit that spawns swarm reinforcements.",
    tags: ["boss", "armor", "tank"],
    abilities: [
      {
        type: "spawnOnHealthThreshold",
        thresholds: [0.75, 0.5, 0.25],
        spawn: ["swarm", 4],
      },
    ],
  }),
  entry({
    key: "ancient_golem",
    name: "Ancient Golem",
    role: "elite",
    designHp: 8000,
    designSpeed: 0.3,
    designGold: 60,
    description: "Ancient construct with extreme durability.",
    tags: ["boss", "armor", "tank", "ancient"],
    abilities: [
      {
        type: "spawnOnHealthThreshold",
        thresholds: [0.75, 0.5, 0.25],
        spawn: ["runner", 4],
      },
      { type: "damageResistance", multiplier: 0.15 },
    ],
  }),
  entry({
    key: "colossus",
    name: "Colossus",
    role: "elite",
    designHp: 14000,
    designSpeed: 0.28,
    designGold: 100,
    description: "Massive war machine requiring sustained focus fire.",
    tags: ["boss", "armor", "tank", "colossus"],
    shieldHpMultiplier: 0.45,
    abilities: [
      {
        type: "spawnOnHealthThreshold",
        thresholds: [0.75, 0.5, 0.25],
        spawn: ["shielded", 3],
      },
      { type: "stompAura", radius: 1.5 },
    ],
  }),
  entry({
    key: "worldbreaker",
    name: "Worldbreaker",
    role: "elite",
    designHp: 50000,
    designSpeed: 0.22,
    designGold: 500,
    description: "Final boss that tests every tower role simultaneously.",
    tags: ["boss", "armor", "tank", "worldbreaker"],
    shieldHpMultiplier: 0.55,
    abilities: [
      {
        type: "worldbreakerPhases",
        phases: [
          {
            phase: 1,
            hpThreshold: 0.75,
            abilities: [{ type: "spawn", enemy: "runner", amount: 8, interval: 12 }],
          },
          {
            phase: 2,
            hpThreshold: 0.5,
            abilities: [
              { type: "spawn", enemy: "swarm", amount: 16, interval: 10 },
              { type: "damageResistance", multiplier: 0.2 },
            ],
          },
          {
            phase: 3,
            hpThreshold: 0.25,
            abilities: [
              { type: "spawn", enemy: "shielded", amount: 6, interval: 14 },
              { type: "rage", speedMultiplier: 1.35 },
            ],
          },
        ],
      },
    ],
  }),
];

/** @type {Record<string, object>} */
export const enemyCatalog = Object.fromEntries(
  catalogEntries.map((e) => [
    e.key,
    {
      name: e.name,
      role: e.runtime.role,
      description: e.description,
      designHp: e.designHp,
      designSpeed: e.designSpeed,
      designGold: e.designGold,
      abilities: e.abilities,
    },
  ]),
);

/** Runtime archetypes keyed by type id (grunt, runner, …). */
export const enemyArchetypes = Object.fromEntries(catalogEntries.map((e) => [e.key, e.runtime]));

/**
 * @param {string} type
 * @returns {object | null}
 */
export function getEnemyCatalogMeta(type) {
  const e = catalogEntries.find((x) => x.key === type);
  if (!e) {
    return null;
  }
  return { name: e.name, description: e.description };
}
