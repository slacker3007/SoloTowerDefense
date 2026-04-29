import { cellToWorld, isBuildable } from "../maps/tileRules";
import { TILE_SIZE } from "../constants";

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
    const buildable = isBuildable(this.map, cellX, cellY);
    const onEnemyPath = this.map.pathMask?.[cellY]?.[cellX] === 1;
    const occupied = this.cellOccupancy.has(key);
    const enoughGold = gameState.gold >= this.towerCost;
    if (!buildable || onEnemyPath || occupied || !enoughGold) {
      return false;
    }

    gameState.gold -= this.towerCost;
    this.cellOccupancy.add(key);
    const world = cellToWorld(cellX, cellY);
    let sprite;
    if (this.scene.textures.exists("blueTower")) {
      sprite = this.scene.add.image(world.x, world.y + TILE_SIZE / 2, "blueTower");
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
      sprite.setDepth(18);
    } else {
      sprite = this.scene.add.rectangle(world.x, world.y + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE * 2, 0x3d69d6);
      sprite.setOrigin(0.5, 1);
    }
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

  getTowerAtCell(cellX, cellY) {
    const world = cellToWorld(cellX, cellY);
    return (
      this.towers.find(
        (tower) => Math.abs(tower.x - world.x) <= TILE_SIZE * 0.25 && Math.abs(tower.y - world.y) <= TILE_SIZE * 0.25,
      ) ?? null
    );
  }

  removeTowerAtCell(cellX, cellY) {
    const tower = this.getTowerAtCell(cellX, cellY);
    if (!tower) {
      return 0;
    }
    const index = this.towers.indexOf(tower);
    if (index >= 0) {
      this.towers.splice(index, 1);
    }
    this.cellOccupancy.delete(`${cellX},${cellY}`);
    tower.sprite?.destroy?.();
    return Math.floor(this.towerCost * 0.5);
  }

  updateCooldowns(deltaSeconds) {
    for (const tower of this.towers) {
      tower.cooldownRemaining = Math.max(0, tower.cooldownRemaining - deltaSeconds);
    }
  }
}
