import { cellToWorld, isBuildable } from "../maps/tileRules";
import { TILE_SIZE } from "../constants";
import {
  economy,
  getTowerBaseEffects,
  getTowerTextureKey,
  getUpgradeOptionsForTower,
  isValidConversionTarget,
  toWorldRange,
  towerCatalog,
  upgrades,
} from "../balance";
import { GAME_EVENT, gameEvents } from "../events.js";

/** Base depth for tower sprites on `towersWorldLayer`. Placement ghost uses 19 — keep computed depths below that. */
const TOWER_SPRITE_DEPTH_BASE = 18;
const TOWER_SPRITE_DEPTH_PER_WORLD_Y = 1e-5;
const TOWER_SPRITE_DEPTH_PER_WORLD_X = 1e-8;

/**
 * @param {number} worldX
 * @param {number} worldY
 * @returns {number}
 */
function towerSpriteDrawDepthFromWorld(worldX, worldY) {
  return (
    TOWER_SPRITE_DEPTH_BASE +
    worldY * TOWER_SPRITE_DEPTH_PER_WORLD_Y +
    worldX * TOWER_SPRITE_DEPTH_PER_WORLD_X
  );
}

/**
 * @param {{ x?: number, y?: number }} tower
 * @returns {number}
 */
function towerSpriteDrawDepthForTower(tower) {
  if (!tower || !Number.isFinite(tower.x) || !Number.isFinite(tower.y)) {
    return TOWER_SPRITE_DEPTH_BASE;
  }
  return towerSpriteDrawDepthFromWorld(tower.x, tower.y);
}

export class TowerSystem {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.towers = [];
    this.cellOccupancy = new Set();
    this.towerCost = economy.baseTowerCost;
  }

  /** Recompute draw depth from `tower.x` / `tower.y` (Y-sort among siblings). */
  refreshTowerSpriteDepths() {
    for (const tower of this.towers) {
      this._applyTowerSpriteDepth(tower);
    }
  }

  /** @param {*} tower */
  _applyTowerSpriteDepth(tower) {
    const depth = towerSpriteDrawDepthForTower(tower);
    tower?.sprite?.setDepth?.(depth);
    // Phaser Container renders by internal list order, not child depth — reorder after depth changes.
    const layer = this.scene.towersWorldLayer;
    if (layer && typeof layer.sort === "function") {
      layer.sort("depth");
    }
  }

  /**
   * Shared validation for placing or reserving a tower cell.
   * @param {number} cellX
   * @param {number} cellY
   * @param {{ gold: number }} gameState
   * @returns {boolean}
   */
  canPlaceTowerAtCell(cellX, cellY, gameState) {
    const key = `${cellX},${cellY}`;
    const buildable = isBuildable(this.map, cellX, cellY);
    const onEnemyPath = this.map.pathMask?.[cellY]?.[cellX] === 1;
    const occupied = this.cellOccupancy.has(key);
    const enoughGold = gameState.gold >= this.towerCost;
    return buildable && !onEnemyPath && !occupied && enoughGold;
  }

  /**
   * Spend gold and reserve the cell for an in-flight builder job (no tower object yet).
   * @param {number} cellX
   * @param {number} cellY
   * @param {{ gold: number }} gameState
   * @returns {boolean}
   */
  tryReserveTowerConstruction(cellX, cellY, gameState) {
    if (!this.canPlaceTowerAtCell(cellX, cellY, gameState)) {
      return false;
    }
    gameState.gold -= this.towerCost;
    this.cellOccupancy.add(`${cellX},${cellY}`);
    return true;
  }

  /**
   * Create the active tower at a cell that was already reserved (gold already spent).
   * @param {number} cellX
   * @param {number} cellY
   * @param {string} [towerType]
   * @returns {boolean}
   */
  completeReservedTower(cellX, cellY, towerType = "basic") {
    const key = `${cellX},${cellY}`;
    if (!this.cellOccupancy.has(key)) {
      return false;
    }
    if (this.getTowerAtCell(cellX, cellY)) {
      return false;
    }

    const world = cellToWorld(cellX, cellY);
    let sprite;
    if (this.scene.textures.exists("blueTower")) {
      sprite = this.scene.add.image(world.x, world.y + TILE_SIZE / 2, "blueTower");
      sprite.setOrigin(0.5, 1);
      sprite.setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
    } else {
      sprite = this.scene.add.rectangle(world.x, world.y + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE * 2, 0x3d69d6);
      sprite.setOrigin(0.5, 1);
    }
    const towersParent = this.scene.towersWorldLayer ?? this.scene.worldRoot;
    if (towersParent) {
      towersParent.add(sprite);
    }
    const resolvedTowerType = towerCatalog[towerType] ? towerType : "basic";
    const base = towerCatalog[resolvedTowerType] ?? towerCatalog.basic;
    const tower = {
      x: world.x,
      y: world.y,
      range: toWorldRange(base.rangeTiles),
      damage: base.damage,
      baseDamage: base.damage,
      cooldown: 1 / base.rate,
      baseCooldown: 1 / base.rate,
      cooldownRemaining: 0,
      projectileSpeed: base.projectileSpeed,
      utilityBudget: base.utilityBudget ?? 1,
      sprite,
      type: resolvedTowerType,
      tier: 0,
      effects: [],
      hitCount: 0,
      lifestealPool: 0,
    };

    this._applyTowerSpriteDepth(tower);
    this.towers.push(tower);
    return true;
  }

  /**
   * Refund and release a reserved cell if construction was cancelled before completion.
   * @param {number} cellX
   * @param {number} cellY
   * @param {{ gold: number }} gameState
   */
  cancelReservedTowerConstruction(cellX, cellY, gameState) {
    const key = `${cellX},${cellY}`;
    if (this.getTowerAtCell(cellX, cellY)) {
      return;
    }
    if (!this.cellOccupancy.has(key)) {
      return;
    }
    this.cellOccupancy.delete(key);
    gameState.gold += this.towerCost;
  }

  /** @deprecated Prefer tryReserveTowerConstruction + builder job + completeReservedTower */
  tryPlaceTower(cellX, cellY, gameState, towerType = "basic") {
    if (!this.tryReserveTowerConstruction(cellX, cellY, gameState)) {
      return false;
    }
    return this.completeReservedTower(cellX, cellY, towerType);
  }

  getTowerAtCell(cellX, cellY) {
    const world = cellToWorld(cellX, cellY);
    return (
      this.towers.find(
        (tower) => Math.abs(tower.x - world.x) <= TILE_SIZE * 0.25 && Math.abs(tower.y - world.y) <= TILE_SIZE * 0.25,
      ) ?? null
    );
  }

  /**
   * @param {*} tower
   * @returns {{ cellX: number, cellY: number } | null}
   */
  getCellForTower(tower) {
    if (!tower || !Number.isFinite(tower.x) || !Number.isFinite(tower.y)) {
      return null;
    }
    const cellX = Math.floor(tower.x / TILE_SIZE);
    const cellY = Math.floor(tower.y / TILE_SIZE);
    return { cellX, cellY };
  }

  /**
   * @param {string} type
   * @returns {{ tower: *, cellX: number, cellY: number }[]}
   */
  getTowerEntriesByType(type) {
    if (typeof type !== "string" || type.length === 0) {
      return [];
    }
    const entries = [];
    for (const tower of this.towers) {
      if (tower?.type !== type) {
        continue;
      }
      const cell = this.getCellForTower(tower);
      if (!cell) {
        continue;
      }
      entries.push({ tower, cellX: cell.cellX, cellY: cell.cellY });
    }
    return entries;
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
    gameEvents.emit(GAME_EVENT.TOWER_SOLD, { tower, cellX, cellY });
    return Math.floor(this.towerCost * economy.sellRefundRate);
  }

  updateCooldowns(deltaSeconds) {
    for (const tower of this.towers) {
      tower.cooldownRemaining = Math.max(0, tower.cooldownRemaining - deltaSeconds);
    }
  }

  getUpgradeOptions(tower) {
    return getUpgradeOptionsForTower(tower);
  }

  tryUpgradeTowerAtCell(cellX, cellY, gameState, optionId) {
    const tower = this.getTowerAtCell(cellX, cellY);
    if (!tower) {
      return false;
    }
    const option = this.getUpgradeOptions(tower).find((entry) => entry.id === optionId);
    if (!option || gameState.gold < option.cost) {
      return false;
    }
    if (option.id.startsWith("convert:")) {
      const targetType = option.id.split(":")[1];
      if (!isValidConversionTarget(targetType) || !towerCatalog[targetType]) {
        return false;
      }
      const target = towerCatalog[targetType];
      gameState.gold -= option.cost;
      tower.type = targetType;
      tower.tier = 0;
      tower.damage = target.damage;
      tower.baseDamage = target.damage;
      tower.cooldown = 1 / target.rate;
      tower.baseCooldown = 1 / target.rate;
      tower.range = toWorldRange(target.rangeTiles);
      tower.projectileSpeed = target.projectileSpeed;
      tower.utilityBudget = target.utilityBudget ?? 1;
      tower.effects = getTowerBaseEffects(targetType);
      tower.hitCount = 0;
      tower.lifestealPool = 0;
      const convertedTextureKey = getTowerTextureKey(targetType);
      if (this.scene.textures.exists(convertedTextureKey) && typeof tower.sprite?.setTexture === "function") {
        tower.sprite.setTexture(convertedTextureKey);
        tower.sprite.setOrigin(0.5, 1);
        tower.sprite.setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
      }
      this._applyTowerSpriteDepth(tower);
      gameEvents.emit(GAME_EVENT.TOWER_CONVERTED, { tower, cellX, cellY, targetType });
      return true;
    }
    const typeUpgrades = upgrades[tower.type];
    const upgradeData = typeUpgrades?.[option.id];
    if (!upgradeData) {
      return false;
    }
    gameState.gold -= option.cost;
    tower.tier = option.tier;
    if (typeof upgradeData.damageMultiplier === "number") {
      tower.damage *= upgradeData.damageMultiplier;
    }
    if (typeof upgradeData.cooldownMultiplier === "number") {
      tower.cooldown *= upgradeData.cooldownMultiplier;
    }
    if (typeof upgradeData.rangeMultiplier === "number") {
      tower.range *= upgradeData.rangeMultiplier;
    }
    if (Array.isArray(upgradeData.effects)) {
      tower.effects.push(...upgradeData.effects);
    }
    gameEvents.emit(GAME_EVENT.TOWER_UPGRADED, { tower, cellX, cellY, optionId });
    return true;
  }
}
