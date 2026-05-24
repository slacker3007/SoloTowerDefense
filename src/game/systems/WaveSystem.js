import {
  getEnemyArchetype,
  getGoldPerKill,
  getHeavyEnemyEarlyHpMultiplier,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getScriptedWave,
  getWaveStep,
} from "../balance";
import { GAME_EVENT, gameEvents } from "../events.js";

const ROLE_VISUALS = {
  normal: { textureKey: "redWarriorRunSheet", animationKey: "red-warrior-run", scale: 0.5 },
  fast: { textureKey: "redArcherRunSheet", animationKey: "red-archer-run", scale: 0.5 },
  tank: { textureKey: "blackWarriorRunSheet", animationKey: "black-warrior-run", scale: 0.5 },
  swarm: { textureKey: "redMonkRunSheet", animationKey: "red-monk-run", scale: 0.5 },
  elite: { textureKey: "redLancerRunSheet", animationKey: "red-lancer-run", scale: 0.5 },
};
const MAX_WAVES = 50;

export class WaveSystem {
  constructor(enemySystem) {
    this.enemySystem = enemySystem;
    this.waveIndex = 0;
    this.spawner = null;
    this.director = {
      hpScale: 1,
      speedScale: 1,
      countOffset: 0,
    };
    this.campaignComplete = false;
  }

  startAutoSpawner(_spawnerDefinition) {
    this.campaignComplete = false;
    this.waveIndex += 1;
    this.spawner = this._buildSpawnerForWave(this.waveIndex);
  }

  setAdaptiveAdjustment(adjustment) {
    this.director.hpScale = adjustment.hpScale ?? 1;
    this.director.speedScale = adjustment.speedScale ?? 1;
    this.director.countOffset = adjustment.countOffset ?? 0;
  }

  _buildSpawnerForWave(waveIndex) {
    if (waveIndex > MAX_WAVES) {
      return null;
    }
    const scriptedWave = getScriptedWave(waveIndex);
    if (scriptedWave) {
      return this._buildScriptedSpawnerForWave(waveIndex, scriptedWave);
    }
    const step = getWaveStep(waveIndex);
    const earlyHeavyHp =
      step.role === "tank" || step.role === "elite" ? getHeavyEnemyEarlyHpMultiplier(waveIndex) : 1;
    const hp = getWaveBaseHp(waveIndex) * this.director.hpScale * earlyHeavyHp;
    const speed = 60 * getWaveBaseSpeed(waveIndex) * this.director.speedScale;
    const spawnCount = Math.max(2, 6 + waveIndex);
    return {
      interval: Math.max(0.35, 1.35 - waveIndex * 0.03),
      timer: 0,
      maxAlive: Math.max(4, Math.floor(5 + waveIndex * 0.7)),
      enemyDefinition: {
        hp,
        speed,
        role: step.role,
        archetype: "grunt",
        waveIndex,
        tags: this._buildEnemyTags(step.role, waveIndex),
        rewardGold: getGoldPerKill(waveIndex, step.breather),
        visual: this._getWaveVisualForRole(step.role),
        fireHitDamageMultiplier: 1,
        postShieldDamageMultiplier: 1,
        slowEffectivenessMultiplier: 1,
        chainVulnerabilityMultiplier: 1,
        damageTakenMultiplier: 1,
        aoeDamageTakenMultiplier: 1,
      },
      waveRole: step.role,
      secondaryRole: step.secondaryRole ?? null,
      metadata: {
        expectedTowerCount: step.expectedTowerCount ?? null,
        expectedDpsBand: step.expectedDpsBand ?? null,
      },
      totalSpawned: 0,
      spawnTarget: spawnCount,
      breather: Boolean(step.breather),
    };
  }

  _buildScriptedSpawnerForWave(waveIndex, scriptedWave) {
    const spawnQueue = [];
    let spawnOrdinal = 0;
    for (const pack of scriptedWave.packs ?? []) {
      const count = Math.max(0, Number(pack?.count) || 0);
      for (let i = 0; i < count; i += 1) {
        spawnQueue.push(this._buildEnemyDefinitionFromPack(waveIndex, pack, spawnOrdinal));
        spawnOrdinal += 1;
      }
    }
    return {
      interval: Math.max(0.3, Number(scriptedWave.interval) || (1.25 - waveIndex * 0.02)),
      timer: 0,
      maxAlive: Math.max(4, Number(scriptedWave.maxAlive) || Math.floor(5 + waveIndex * 0.7)),
      waveRole: scriptedWave.role ?? "normal",
      secondaryRole: null,
      metadata: {
        expectedTowerCount: Math.max(2, 2 + Math.floor((waveIndex - 1) * 0.5)),
        expectedDpsBand: [16 + waveIndex * 8, 26 + waveIndex * 11],
      },
      totalSpawned: 0,
      spawnTarget: spawnQueue.length,
      spawnQueue,
      breather: false,
      enemyDefinition: spawnQueue[0] ?? null,
    };
  }

  _traitHash(waveIndex, typeKey, ordinal) {
    const key = typeof typeKey === "string" ? typeKey : "grunt";
    return ((waveIndex * 73856093) ^ (key.length * 19349663) ^ (ordinal * 83492791)) >>> 0;
  }

  /**
   * Deterministic anti-stall rolls for late waves (solo survival).
   * @param {Record<string, unknown>} def
   * @param {number} waveIndex
   * @param {number} ordinal
   */
  _applyPostWave30Traits(def, waveIndex, ordinal) {
    if (waveIndex <= 30) {
      return;
    }
    const h = this._traitHash(waveIndex, def.archetype ?? def.role ?? "grunt", ordinal);
    if ((h & 0xff) < 70) {
      def.speedRampPerSecond = Math.max(Number(def.speedRampPerSecond) || 0, 0.015);
    }
    if (((h >> 8) & 0xff) < 60) {
      def.fireHitDamageMultiplier = (Number.isFinite(def.fireHitDamageMultiplier) ? def.fireHitDamageMultiplier : 1) * 0.5;
      const tagBurn =
        Array.isArray(def.tags) && def.tags.includes("fireResist") ? 0.35 : 1;
      def.burnDamageMultiplier = (Number.isFinite(def.burnDamageMultiplier) ? def.burnDamageMultiplier : tagBurn) * 0.5;
    }
    if (((h >> 16) & 0xff) < 60) {
      def.slowEffectivenessMultiplier = (Number.isFinite(def.slowEffectivenessMultiplier) ? def.slowEffectivenessMultiplier : 1) * 0.4;
    }
    if (((h >> 24) & 0xff) < 60) {
      def.aoeDamageTakenMultiplier = (Number.isFinite(def.aoeDamageTakenMultiplier) ? def.aoeDamageTakenMultiplier : 1) * 0.5;
    }
  }

  _buildEnemyDefinitionFromPack(waveIndex, pack, spawnOrdinal = 0) {
    const archetype = getEnemyArchetype(pack.type);
    const baseHp = getWaveBaseHp(waveIndex);
    const baseSpeed = 60 * getWaveBaseSpeed(waveIndex);
    const packHpMult = Number.isFinite(pack.hpMultiplier) ? pack.hpMultiplier : 1;
    const packSpeedMult = Number.isFinite(pack.speedMultiplier) ? pack.speedMultiplier : 1;
    let hp = baseHp * (archetype.hpMultiplier ?? 1) * packHpMult * this.director.hpScale;
    const role = archetype.role ?? "normal";
    if (role === "tank" || role === "elite") {
      hp *= getHeavyEnemyEarlyHpMultiplier(waveIndex);
    }
    const speed = baseSpeed * (archetype.speedMultiplier ?? 1) * packSpeedMult * this.director.speedScale;
    const rewardBase = getGoldPerKill(waveIndex, false);
    const rewardMult = Number.isFinite(pack.rewardMultiplier) ? pack.rewardMultiplier : 1;
    const rewardGold = Math.max(1, Math.round(rewardBase * (archetype.rewardMultiplier ?? 1) * rewardMult));
    const tags = [...new Set([role, ...(archetype.tags ?? []), ...(pack.tags ?? [])])];
    const def = {
      hp,
      speed,
      role,
      archetype: pack.type,
      tags,
      rewardGold,
      visual: this._getWaveVisualForRole(role),
      bonusGoldOnKill: archetype.bonusGoldOnKill ?? 0,
      shieldHp: Number.isFinite(archetype.shieldHpMultiplier) ? hp * archetype.shieldHpMultiplier : 0,
      regenPerSecond: Number.isFinite(archetype.regenPerSecondMultiplier) ? hp * archetype.regenPerSecondMultiplier : 0,
      splitOnDeath: archetype.splitOnDeath ?? null,
      spawnOnThresholds: Array.isArray(archetype.spawnOnThresholds) ? archetype.spawnOnThresholds.map((entry) => ({ ...entry })) : [],
      waveIndex,
      evasionChance: Number.isFinite(archetype.evasionChance) ? archetype.evasionChance : 0,
      flatDamageReduction: Number.isFinite(archetype.flatDamageReduction) ? archetype.flatDamageReduction : 0,
      fireHitDamageMultiplier: Number.isFinite(archetype.fireHitDamageMultiplier) ? archetype.fireHitDamageMultiplier : 1,
      postShieldDamageMultiplier: Number.isFinite(archetype.postShieldDamageMultiplier) ? archetype.postShieldDamageMultiplier : 1,
      slowEffectivenessMultiplier: Number.isFinite(archetype.slowEffectivenessMultiplier) ? archetype.slowEffectivenessMultiplier : 1,
      chainVulnerabilityMultiplier: Number.isFinite(archetype.chainVulnerabilityMultiplier) ? archetype.chainVulnerabilityMultiplier : 1,
      damageTakenMultiplier: Number.isFinite(archetype.damageTakenMultiplier) ? archetype.damageTakenMultiplier : 1,
      aoeDamageTakenMultiplier: 1,
      earlyKillHpThreshold: archetype.earlyKillHpThreshold ?? null,
      earlyKillBonusGold: Number.isFinite(archetype.earlyKillBonusGold) ? archetype.earlyKillBonusGold : 0,
      stompAuraRadiusTiles: Number.isFinite(archetype.stompAuraRadiusTiles) ? archetype.stompAuraRadiusTiles : 0,
      stompAuraInterval: Number.isFinite(archetype.stompAuraInterval) ? archetype.stompAuraInterval : 2.4,
      bossPhaseBands: Array.isArray(archetype.bossPhaseBands) ? archetype.bossPhaseBands.map((b) => ({ ...b })) : null,
    };
    this._applyPostWave30Traits(def, waveIndex, spawnOrdinal);
    return def;
  }

  _getWaveVisualForRole(role) {
    const safeRole = typeof role === "string" && role.length > 0 ? role : "normal";
    return ROLE_VISUALS[safeRole] ?? ROLE_VISUALS.normal;
  }

  update(deltaSeconds) {
    if (!this.spawner || this.campaignComplete) {
      return;
    }

    this.spawner.timer += deltaSeconds;
    if (this.spawner.timer < this.spawner.interval) {
      return;
    }

    const activeCount = this.enemySystem.getActiveEnemies().length;
    if (activeCount >= this.spawner.maxAlive) {
      return;
    }
    if (this.spawner.totalSpawned >= this.spawner.spawnTarget && activeCount === 0) {
      if (this.waveIndex >= MAX_WAVES) {
        this.campaignComplete = true;
        this.spawner = null;
        return;
      }
      this.waveIndex += 1;
      this.spawner = this._buildSpawnerForWave(this.waveIndex);
      return;
    }
    if (this.spawner.totalSpawned >= this.spawner.spawnTarget) {
      return;
    }

    this.spawner.timer = 0;
    let definition = this.spawner.spawnQueue?.[this.spawner.totalSpawned] ?? this.spawner.enemyDefinition;
    if (!this.spawner.spawnQueue) {
      const ord = this.spawner.totalSpawned;
      definition = { ...definition };
      this._applyPostWave30Traits(definition, this.waveIndex, ord);
    }
    const spawned = this.enemySystem.spawnEnemy(definition);
    if (spawned) {
      this.spawner.totalSpawned += 1;
      if (!this.spawner.bossAlerted && Array.isArray(definition?.tags) && definition.tags.includes("boss")) {
        this.spawner.bossAlerted = true;
        gameEvents.emit(GAME_EVENT.BOSS_ALERT, { wave: this.waveIndex, archetype: definition.archetype });
      }
    }

    const triggeredSpawns = this.enemySystem.consumeTriggeredSpawns?.() ?? [];
    if (triggeredSpawns.length > 0 && Array.isArray(this.spawner.spawnQueue)) {
      for (const trigger of triggeredSpawns) {
        const count = Math.max(0, Number(trigger.count) || 0);
        const ordBase = this.spawner.spawnQueue.length;
        for (let i = 0; i < count; i += 1) {
          this.spawner.spawnQueue.push(
            this._buildEnemyDefinitionFromPack(this.waveIndex, { type: trigger.type }, ordBase + i),
          );
        }
      }
      this.spawner.spawnTarget = this.spawner.spawnQueue.length;
    }
  }

  getProgressInfo() {
    const spawner = this.spawner;
    const enemiesAlive = this.enemySystem?.getActiveEnemies?.().length ?? 0;
    if (!spawner) {
      return {
        spawnTarget: 0,
        totalSpawned: 0,
        enemiesAlive,
        remainingToSpawn: 0,
        progress: 0,
      };
    }
    const spawnTarget = Math.max(0, Number(spawner.spawnTarget) || 0);
    const totalSpawned = Math.max(0, Math.min(spawnTarget, Number(spawner.totalSpawned) || 0));
    const remainingToSpawn = Math.max(0, spawnTarget - totalSpawned);
    const completion = spawnTarget > 0 ? totalSpawned / spawnTarget : 0;
    const clearPhase = spawnTarget > 0 && remainingToSpawn === 0
      ? Math.min(1, enemiesAlive > 0 ? 0.92 : 1)
      : completion;
    return {
      spawnTarget,
      totalSpawned,
      enemiesAlive,
      remainingToSpawn,
      progress: Math.max(0, Math.min(1, clearPhase)),
    };
  }

  _getRoleIconKey(role) {
    const rawRole = typeof role === "string" && role.length > 0 ? role : "normal";
    const safeRole = ["normal", "fast", "tank", "swarm", "elite"].includes(rawRole) ? rawRole : "normal";
    return `enemyRole_${safeRole}`;
  }

  getWavePreview(waveIndex) {
    const safeWave = Math.max(1, Math.min(MAX_WAVES, Number(waveIndex) || 1));
    const scripted = getScriptedWave(safeWave);
    const step = scripted ?? getWaveStep(safeWave);
    const role = typeof step?.role === "string" && step.role.length > 0 ? step.role : "normal";
    const secondaryRole = typeof step?.secondaryRole === "string" && step.secondaryRole.length > 0
      ? step.secondaryRole
      : null;
    return {
      wave: safeWave,
      role,
      secondaryRole,
      iconKey: this._getRoleIconKey(role),
      secondaryIconKey: secondaryRole ? this._getRoleIconKey(secondaryRole) : null,
      visual: this._getWaveVisualForRole(role),
      breather: Boolean(step?.breather),
    };
  }

  getWaveHudPreview() {
    const currentWave = Math.max(1, Number(this.waveIndex) || 1);
    const canShowNext = !this.campaignComplete && currentWave < MAX_WAVES;
    return {
      current: this.getWavePreview(currentWave),
      next: canShowNext ? this.getWavePreview(currentWave + 1) : null,
    };
  }

  isCampaignComplete() {
    return this.campaignComplete;
  }

  _buildEnemyTags(role, waveIndex) {
    const tags = [role];
    if (waveIndex >= 8 && (role === "tank" || role === "elite")) {
      tags.push("armor");
    }
    if (waveIndex >= 12 && role === "fast") {
      tags.push("slowResist");
    }
    if (waveIndex >= 10 && role === "elite") {
      tags.push("burnImmune");
    }
    return tags;
  }
}
