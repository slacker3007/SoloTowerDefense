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
