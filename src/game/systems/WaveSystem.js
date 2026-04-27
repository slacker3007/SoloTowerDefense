export class WaveSystem {
  constructor(enemySystem) {
    this.enemySystem = enemySystem;
    this.waveIndex = 0;
    this.spawner = null;
  }

  startAutoSpawner(spawnerDefinition) {
    this.waveIndex += 1;
    this.spawner = {
      interval: spawnerDefinition.intervalSeconds,
      timer: 0,
      maxAlive: spawnerDefinition.maxAlive,
      enemyDefinition: spawnerDefinition.enemy,
      totalSpawned: 0,
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

    this.spawner.timer = 0;
    const spawned = this.enemySystem.spawnEnemy(this.spawner.enemyDefinition);
    if (spawned) {
      this.spawner.totalSpawned += 1;
    }
  }
}
