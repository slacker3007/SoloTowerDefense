import {
  enemyRoleModifiers,
  getGoldPerKill,
  getWaveBaseCount,
  getWaveBaseHp,
  getWaveBaseSpeed,
  getWaveStep,
} from "../balance";

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
  }

  startAutoSpawner(_spawnerDefinition) {
    this.waveIndex += 1;
    this.spawner = this._buildSpawnerForWave(this.waveIndex);
  }

  setAdaptiveAdjustment(adjustment) {
    this.director.hpScale = adjustment.hpScale ?? 1;
    this.director.speedScale = adjustment.speedScale ?? 1;
    this.director.countOffset = adjustment.countOffset ?? 0;
  }

  _buildSpawnerForWave(waveIndex) {
    const step = getWaveStep(waveIndex);
    const role = enemyRoleModifiers[step.role] ?? enemyRoleModifiers.normal;
    const secondaryRole = enemyRoleModifiers[step.secondaryRole] ?? null;
    const hpFactor = secondaryRole ? (role.hp + secondaryRole.hp) * 0.5 : role.hp;
    const speedFactor = secondaryRole ? (role.speed + secondaryRole.speed) * 0.5 : role.speed;
    const countFactor = secondaryRole ? (role.count + secondaryRole.count) * 0.5 : role.count;
    const hp = getWaveBaseHp(waveIndex) * hpFactor * this.director.hpScale;
    const speed = 60 * getWaveBaseSpeed(waveIndex) * speedFactor * this.director.speedScale;
    const spawnCount = Math.max(2, Math.floor(getWaveBaseCount(waveIndex) * countFactor + this.director.countOffset));
    return {
      interval: Math.max(0.35, 1.35 - waveIndex * 0.03),
      timer: 0,
      maxAlive: Math.max(4, Math.floor(5 + waveIndex * 0.7)),
      enemyDefinition: {
        hp,
        speed,
        role: step.role,
        tags: this._buildEnemyTags(step.role, waveIndex),
        rewardGold: getGoldPerKill(waveIndex, step.breather),
        visual: this._getWaveVisual(waveIndex),
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

  _getWaveVisual(waveIndex) {
    if (waveIndex === 2) {
      return { textureKey: "redLancerRunSheet", animationKey: "red-lancer-run", scale: 0.5 };
    }
    if (waveIndex === 3) {
      return { textureKey: "redMonkRunSheet", animationKey: "red-monk-run", scale: 0.5 };
    }
    if (waveIndex === 4) {
      return { textureKey: "redArcherRunSheet", animationKey: "red-archer-run", scale: 0.5 };
    }
    return { textureKey: "redWarriorRunSheet", animationKey: "red-warrior-run", scale: 0.5 };
  }

  update(deltaSeconds) {
    if (!this.spawner) {
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
      this.waveIndex += 1;
      this.spawner = this._buildSpawnerForWave(this.waveIndex);
      return;
    }
    if (this.spawner.totalSpawned >= this.spawner.spawnTarget) {
      return;
    }

    this.spawner.timer = 0;
    const spawned = this.enemySystem.spawnEnemy(this.spawner.enemyDefinition);
    if (spawned) {
      this.spawner.totalSpawned += 1;
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
    const safeRole = typeof role === "string" && role.length > 0 ? role : "normal";
    return `enemyRole_${safeRole}`;
  }

  getWavePreview(waveIndex) {
    const safeWave = Math.max(1, Number(waveIndex) || 1);
    const step = getWaveStep(safeWave);
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
      visual: this._getWaveVisual(safeWave),
      breather: Boolean(step?.breather),
    };
  }

  getWaveHudPreview() {
    const currentWave = Math.max(1, Number(this.waveIndex) || 1);
    return {
      current: this.getWavePreview(currentWave),
      next: this.getWavePreview(currentWave + 1),
    };
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
