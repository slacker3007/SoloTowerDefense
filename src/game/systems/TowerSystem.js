import { cellToWorld, isBuildable } from "../maps/tileRules";

export class TowerSystem {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.towers = [];
    this.cellOccupancy = new Set();
    this.towerCost = 30;
  }

  tryPlaceTower(cellX, cellY, gameState) {
    const key = `${cellX},${cellY}`;
    if (!isBuildable(this.map, cellX, cellY) || this.cellOccupancy.has(key) || gameState.gold < this.towerCost) {
      return false;
    }

    gameState.gold -= this.towerCost;
    this.cellOccupancy.add(key);
    const world = cellToWorld(cellX, cellY);
    const sprite = this.scene.add.rectangle(world.x, world.y, 30, 30, 0x44762d);
    if (this.scene.worldRoot) {
      this.scene.worldRoot.add(sprite);
    }
    const tower = {
      x: world.x,
      y: world.y,
      range: 180,
      damage: 20,
      cooldown: 0.5,
      cooldownRemaining: 0,
      sprite,
    };

    this.towers.push(tower);
    return true;
  }

  updateCooldowns(deltaSeconds) {
    for (const tower of this.towers) {
      tower.cooldownRemaining = Math.max(0, tower.cooldownRemaining - deltaSeconds);
    }
  }
}
