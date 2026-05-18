import Phaser from "phaser";
import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  GAME_HEIGHT,
  GAME_WIDTH,
  STARTING_GOLD,
  STARTING_LIVES,
  TILE_SIZE,
} from "../game/constants";
import {
  createTinySwordsAnimations,
  hasTinySwordsFolderHint,
  SHEEP_IDLE_ANIM_KEY,
  SHEEP_IDLE_SHEET_KEY,
} from "../game/assets";
import { createFreshMap001 } from "../game/maps/map-001";
import {
  cellToWorld,
  isInsideGrid,
  worldToCell,
} from "../game/maps/tileRules";
import { DECORATION_IMAGE_KEYS, MAP_TILE_LAYER_COUNT } from "../game/maps/tileOverrideSchema";
import { EnemySystem } from "../game/systems/EnemySystem";
import { BuilderSystem } from "../game/systems/BuilderSystem";
import { TowerSystem } from "../game/systems/TowerSystem";
import { CombatSystem } from "../game/systems/CombatSystem";
import { WaveSystem } from "../game/systems/WaveSystem";
import { Hud } from "../game/ui/Hud";
import { blueBarracksHpBarYOffset, createBlueBarracksHpBar } from "../game/ui/BlueBarracksHpBar";
import { destroyUnitHpOverlay, ensureUnitHpOverlay, syncUnitHpBars } from "../game/ui/UnitHpBar";
import { DebugOverlay } from "../game/debug/DebugOverlay";
import {
  BASIC_CONVERSION_ORDER,
  balanceRules,
  economy,
  getAdaptiveAdjustment,
  getTowerDescription,
  getTowerDisplayName,
  getTowerEffectShortSummary,
  getTowerProjectileColor,
  getTowerUiAccentColor,
  getMaxSplashRadiusTilesFromEffects,
  getTowerTextureKey,
  getTowerTooltipSummary,
  toWorldRange,
  towerCatalog,
} from "../game/balance";
import { getDisplaySettings } from "../game/settings/displaySettings.js";
import { MapEditor } from "../game/editor/MapEditor";
import { EditorPanel } from "../game/editor/EditorPanel";
import { GRID_KEYBIND_ACTION_IDS, KeybindStore } from "../game/input/KeybindStore.js";
import { ensureMapLayerTiles, ensureMapOverrideGrids, ensureMapTilesets, ensurePathMaskGrid } from "../game/maps/mapUtils";
import { cozyTheme, createCozyButton, createCozyPanel } from "../game/ui/CozyTheme";
import { getViewportProfile } from "../game/config";

const BARRACKS_CLICK_WIDTH = 192;
const BARRACKS_CLICK_HEIGHT = 256;
const BLUE_BARRACKS_FIRE_HP_THRESHOLD = 10;
const BLUE_BARRACKS_FIRE_SHEET_KEY = "fire01Sheet";
const BLUE_BARRACKS_FIRE_ANIM_KEY = "fire-01-loop";
const BLUE_BARRACKS_FIRE_POINTS = [
  { x: -58, y: -8, scale: 1.05 },
  { x: 58, y: -8, scale: 1.05 },
  { x: -72, y: 30, scale: 1.2 },
  { x: 72, y: 30, scale: 1.2 },
  { x: 0, y: 42, scale: 1.35 },
];
const TOWER_DOUBLE_CLICK_MS = 300;
const DEFAULT_CAMERA_ZOOM = 0.59;
const DEFAULT_CAMERA_SCROLL_X = -12;
const DEFAULT_CAMERA_SCROLL_Y = 228;
/** World scrollY at game start before panning to `DEFAULT_CAMERA_SCROLL_Y` (enemy base in view). */
const INTRO_CAMERA_SCROLL_Y = 514;
const INTRO_CAMERA_PAN_MS = 3000;
const CAMERA_VERTICAL_ONLY = true;

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {{ sheet: string, frame: number } | null} tile
 * @param {number} cellX
 * @param {number} cellY
 * @param {number} depth
 */
function addLayerTileSprite(scene, container, tile, cellX, cellY, depth) {
  if (tile == null || typeof tile.sheet !== "string" || typeof tile.frame !== "number") {
    return;
  }
  if (!scene.textures.exists(tile.sheet)) {
    return;
  }
  const px = cellX * TILE_SIZE;
  const py = cellY * TILE_SIZE;
  if (tile.sheet === SHEEP_IDLE_SHEET_KEY) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, tile.sheet, 0);
    spr.setDisplaySize(64, 64);
    spr.setDepth(depth);
    if (scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
      spr.play(SHEEP_IDLE_ANIM_KEY, false, Phaser.Math.Clamp(Math.floor(tile.frame), 0, 5));
    }
    container.add(spr);
    return;
  }
  if (DECORATION_IMAGE_KEYS.includes(tile.sheet)) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, tile.sheet);
    spr.setOrigin(0.5, 1);
    spr.setDisplaySize(128, 192);
    spr.setDepth(depth);
    container.add(spr);
    return;
  }
  const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, tile.sheet, tile.frame);
  spr.setDepth(depth);
  container.add(spr);
}

/**
 * @typedef {Object} HudActionPlacement
 * @property {number} innerRow 1 inside the action area
 * @property {number} innerCol 1..10 inside the action area
 * @property {string} actionId Action handled by `handleHudAction`
 * @property {string} label
 * @property {boolean} [enabled]
 * @property {string} [iconKey]
 * @property {number} [iconOffsetX]
 * @property {number} [iconOffsetY]
 * @property {string} [tooltipTitle]
 * @property {string} [tooltipDescription]
 * @property {number | null} [tooltipCost]
 * @property {string} [tooltipResource]
 * @property {string} [tooltipWarning]
 * @property {number} [accentColor]
 * @property {number | null} [cost]
 * @property {boolean} [showInfoButton]
 */

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
    this._mapPixelW = 0;
    this._mapPixelH = 0;
    /** @type {boolean} */
    this._cameraPanning = false;
    this._lastPanX = 0;
    this._lastPanY = 0;
    this.selectedBuilding = null;
    this._hudActionMode = "empty";
    this._pendingPlacement = null;
    this._towerGhost = null;
    this._towerConversionPage = 0;
    this._performance = { clearedWaves: 0, leaksInWave: 0, livesAtWaveStart: STARTING_LIVES, waveTimer: 0 };
    this._adaptiveEnabled = balanceRules.adaptive.enabled;
    this._blueBarracksFireFx = null;
    this._towerDoubleClick = { signature: null, at: 0 };
    this._selectedTowerType = null;
    this._selectedTowerCells = [];
    this._selectionOutlineGfx = null;
    this._selectionPulse = null;
    this._lastSelectionPulseKey = null;
    this._runEnded = false;
    this._pauseOverlayOpen = false;
    this._pauseOverlayRoot = null;
    this._runEndOverlayRoot = null;
    this._settingsReturnToPause = false;
    this._placementReturnMode = null;
    /** @type {Phaser.Tweens.Tween | null} */
    this._introCameraTween = null;
    this._introCameraPanActive = false;
  }

  create() {
    // Phaser reuses this scene instance on `restart()`; constructor does not run again.
    this._runEnded = false;
    this._pauseOverlayOpen = false;
    this._settingsReturnToPause = false;
    this._placementReturnMode = null;
    this.selectedBuilding = null;
    this.clearTowerGroupSelection();
    this._hudActionMode = "empty";
    this._towerConversionPage = 0;
    this._towerDoubleClick = { signature: null, at: 0 };
    this._selectionPulse = null;
    this._lastSelectionPulseKey = null;
    this._cameraPanning = false;
    this._performance = { clearedWaves: 0, leaksInWave: 0, livesAtWaveStart: STARTING_LIVES, waveTimer: 0 };
    // On scene.restart(), old overlay references can briefly survive until recreated.
    // Clear them before the first resize/layout pass to avoid stale-child access.

    this.map = createFreshMap001();
    this.gameState = {
      gold: STARTING_GOLD,
      lives: STARTING_LIVES,
      wave: 0,
      paused: false,
      gameSpeed: 1,
    };

    createTinySwordsAnimations(this);

    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensurePathMaskGrid(this.map);
    this.editor = new MapEditor(this, this.map, { hydrateFromStorage: false });
    this.editorPanel = new EditorPanel(this.editor);

    this.worldRoot = this.add.container(0, 0);
    this.terrainContainer = this.add.container(0, 0);
    this.blueBarracksHpRoot = this.add.container(0, 0);
    this.worldRoot.add(this.terrainContainer);
    this.worldRoot.add(this.blueBarracksHpRoot);
    this.unitsWorldLayer = this.add.container(0, 0);
    this.towersWorldLayer = this.add.container(0, 0);
    this.effectsWorldLayer = this.add.container(0, 0);
    this.worldRoot.add(this.unitsWorldLayer);
    this.worldRoot.add(this.towersWorldLayer);
    this.worldRoot.add(this.effectsWorldLayer);
    this._selectionOutlineGfx = this.add.graphics();
    this._selectionOutlineGfx.setDepth(60);
    this.effectsWorldLayer.add(this._selectionOutlineGfx);
    /** @type {{ container: Phaser.GameObjects.Container, setRatio: (r: number) => void, setValues: (current: number, max: number) => void, destroy: () => void } | null} */
    this._homeHpBar = null;
    this.redrawTerrain();

    this.enemySystem = new EnemySystem(this, {
      map: this.map,
      spawnCell: this.map.points.enemyBarracks,
      targetCell: this.map.points.homeBarracks,
    });
    this.towerSystem = new TowerSystem(this, this.map);
    this.builderSystem = new BuilderSystem(this, {
      map: this.map,
      towerSystem: this.towerSystem,
      onAfterJobComplete: () => {
        this.debugOverlay?.redraw?.();
        this.hud?.render?.(
          this.gameState,
          this.towerSystem.towers.length,
          STARTING_LIVES,
          this.selectedBuilding,
          this.getWaveInfo(),
        );
      },
    });
    this.combatSystem = new CombatSystem(this, this.towerSystem, this.enemySystem);
    this.waveSystem = new WaveSystem(this.enemySystem);
    this.keybindStore = new KeybindStore();
    this.hud = new Hud(this, {
      maxLives: STARTING_LIVES,
      onMapEditorFromMenu: () => this.toggleMapEditorFromMenu(),
      onOpenSettings: () => this.openSettingsFromGame(),
      onMainMenu: () => this.backToMainMenu(),
      onCycleGameSpeed: () => this.cycleGameSpeed(),
      onTogglePause: () => this.togglePause(),
    });
    this.debugOverlay = new DebugOverlay(this);
    this.debugOverlay.redraw();
    this.worldRoot.add(this.debugOverlay.graphics);

    this.waveSystem.startAutoSpawner();
    this.gameState.wave = this.waveSystem.waveIndex;
    this._performance.livesAtWaveStart = this.gameState.lives;

    this._mapPixelW = this.map.width * TILE_SIZE;
    this._mapPixelH = this.map.height * TILE_SIZE;
    this.cameras.main.removeBounds();

    this.cameras.main.ignore(this.hud.getUiObjects());
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, "ui");
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.uiCamera.ignore(this.worldRoot);
    this._boundResize = (size) => this.handleResize(size);
    this.scale.on(Phaser.Scale.Events.RESIZE, this._boundResize);
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    this._startIntroCameraPan();

    this.unbindInput();
    this.bindInput();
    this.createPauseOverlay();
    this.createRunEndOverlay();
    ensureUnitHpOverlay(this);
    this.syncHudForEditorMode({ clampCamera: false });
    this.applyDefaultBlueBarracksSelection();
    this.applyHudDisplayPreferences();
    this.updateHudActions();
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
  }

  shutdown() {
    this._introCameraTween?.remove?.();
    this._introCameraTween = null;
    this._introCameraPanActive = false;
    this.unbindInput();
    if (this.uiCamera) {
      this.cameras.remove(this.uiCamera, true);
      this.uiCamera = null;
    }
    if (this._boundResize) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this._boundResize);
      this._boundResize = null;
    }
    this.clearTowerPlacement();
    this.builderSystem?.destroy?.();
    this._homeHpBar?.destroy();
    this._homeHpBar = null;
    this._destroyBlueBarracksFireEffect();
    this._selectionOutlineGfx?.destroy?.();
    this._selectionOutlineGfx = null;
    this.blueBarracksHpRoot?.destroy(true);
    this.editorPanel?.destroy();
    this.editor.destroy();
    this.hud?.dispose();
    this.hud = null;
    this._pauseOverlayRoot?.destroy(true);
    this._pauseOverlayRoot = null;
    this._runEndOverlayRoot?.destroy(true);
    this._runEndOverlayRoot = null;
    destroyUnitHpOverlay(this);
  }

  /**
   * @param {Phaser.Input.Pointer} pointer
   * @returns {{ x: number, y: number } | null}
   */
  pointerToCell(pointer) {
    const cell = worldToCell(pointer.worldX, pointer.worldY);
    if (!isInsideGrid(cell.x, cell.y, this.map.width, this.map.height)) {
      return null;
    }
    return cell;
  }

  /**
   * @param {number} cellX
   * @param {number} cellY
   * @returns {Record<string, unknown> | null}
   */
  getTowerAtCell(cellX, cellY) {
    return this.towerSystem.getTowerAtCell(cellX, cellY);
  }

  /**
   * @param {number} cellX
   * @param {number} cellY
   * @returns {string | null}
   */
  getBarracksKeyAtCell(cellX, cellY) {
    return this.map.buildings?.[cellY]?.[cellX] ?? null;
  }

  /**
   * @param {number} cellX
   * @param {number} cellY
   * @returns {boolean}
   */
  selectBuildingAtCell(cellX, cellY) {
    const tower = this.getTowerAtCell(cellX, cellY);
    if (tower) {
      this._towerConversionPage = 0;
      this.selectedBuilding = {
        kind: "tower",
        type: tower.type,
        tier: tower.tier,
        label: getTowerDisplayName(tower.type),
        iconKey: getTowerTextureKey(tower.type),
        cellX,
        cellY,
        damage: tower.damage,
        cooldown: tower.cooldown,
        range: tower.range,
        effects: tower.effects ?? [],
        effectSummary: getTowerEffectShortSummary(tower.effects ?? []),
        selectedCount: 1,
      };
      return true;
    }

    const barracksKey = this.getBarracksKeyAtCell(cellX, cellY);
    if (barracksKey === "barracks_blue") {
      this.selectedBuilding = {
        kind: "barracks",
        label: "Blue Barracks",
        cellX,
        cellY,
        hpCurrent: this.gameState.lives,
        hpMax: STARTING_LIVES,
      };
      return true;
    }
    if (barracksKey === "barracks_red") {
      this.selectedBuilding = {
        kind: "barracks",
        label: "Red Barracks",
        cellX,
        cellY,
      };
      return true;
    }

    this.selectedBuilding = null;
    return false;
  }

  clearTowerGroupSelection() {
    this._selectedTowerType = null;
    this._selectedTowerCells = [];
  }

  /**
   * @param {string} towerType
   * @param {number} anchorCellX
   * @param {number} anchorCellY
   * @param {Record<string, unknown> | null} [anchorTower]
   * @returns {boolean}
   */
  selectTowerGroupByType(towerType, anchorCellX, anchorCellY, anchorTower = null) {
    if (typeof towerType !== "string" || towerType.length === 0) {
      this.clearTowerGroupSelection();
      return false;
    }
    const tower = anchorTower ?? this.getTowerAtCell(anchorCellX, anchorCellY);
    if (!tower || tower.type !== towerType) {
      this.clearTowerGroupSelection();
      return false;
    }
    const entries = this.towerSystem.getTowerEntriesByType(towerType);
    this._selectedTowerType = towerType;
    this._selectedTowerCells = entries.map((entry) => ({ x: entry.cellX, y: entry.cellY }));
    this.selectedBuilding = {
      kind: "tower",
      type: towerType,
      tier: tower.tier,
      label: getTowerDisplayName(towerType),
      iconKey: getTowerTextureKey(towerType),
      cellX: anchorCellX,
      cellY: anchorCellY,
      damage: tower.damage,
      cooldown: tower.cooldown,
      range: tower.range,
      effects: tower.effects ?? [],
      effectSummary: getTowerEffectShortSummary(tower.effects ?? []),
      selectedCount: Math.max(1, entries.length),
    };
    return true;
  }

  refreshTowerGroupSelection() {
    if (this._selectedTowerType == null || this.selectedBuilding?.kind !== "tower") {
      return;
    }
    const anchorTower = this.getTowerAtCell(this.selectedBuilding.cellX, this.selectedBuilding.cellY);
    if (!anchorTower || anchorTower.type !== this._selectedTowerType) {
      this.clearTowerGroupSelection();
      this.selectedBuilding.selectedCount = 1;
      return;
    }
    const entries = this.towerSystem.getTowerEntriesByType(this._selectedTowerType);
    this._selectedTowerCells = entries.map((entry) => ({ x: entry.cellX, y: entry.cellY }));
    this.selectedBuilding.type = anchorTower.type;
    this.selectedBuilding.tier = anchorTower.tier;
    this.selectedBuilding.label = getTowerDisplayName(anchorTower.type);
    this.selectedBuilding.iconKey = getTowerTextureKey(anchorTower.type);
    this.selectedBuilding.damage = anchorTower.damage;
    this.selectedBuilding.cooldown = anchorTower.cooldown;
    this.selectedBuilding.range = anchorTower.range;
    this.selectedBuilding.effects = anchorTower.effects ?? [];
    this.selectedBuilding.effectSummary = getTowerEffectShortSummary(anchorTower.effects ?? []);
    this.selectedBuilding.selectedCount = Math.max(1, entries.length);
  }

  redrawSelectionOutline() {
    const gfx = this._selectionOutlineGfx;
    if (!gfx) {
      return;
    }
    gfx.clear();
    const selected = this.selectedBuilding;
    if (!selected) {
      this._selectionPulse = null;
      this._lastSelectionPulseKey = null;
      return;
    }
    const now = this.time?.now ?? 0;
    const selectionPulseKey = this._getSelectionPulseKey(selected);
    if (selectionPulseKey && selectionPulseKey !== this._lastSelectionPulseKey) {
      this._selectionPulse = { startedAt: now, durationMs: 320 };
      this._lastSelectionPulseKey = selectionPulseKey;
    }
    const pulseState = this._selectionPulse;
    let rangePulse = 0;
    if (pulseState) {
      const rawProgress = pulseState.durationMs > 0 ? (now - pulseState.startedAt) / pulseState.durationMs : 1;
      const progress = Phaser.Math.Clamp(rawProgress, 0, 1);
      rangePulse = Math.sin(progress * Math.PI);
      if (progress >= 1) {
        this._selectionPulse = null;
      }
    }
    if (selected.kind === "tower") {
      const cells =
        this._selectedTowerType && this._selectedTowerCells.length > 0
          ? this._selectedTowerCells
          : [{ x: selected.cellX, y: selected.cellY }];
      const time = now;
      const pulse = 0.7 + 0.3 * Math.sin(time / 220);
      const glowColor = cozyTheme.colors.panelBorder ?? 0xbda67a;
      const glowAlpha = 0.32;
      const innerOutlineAlpha = 0.45 * pulse + 0.35;
      const ringRadiusX = TILE_SIZE * 0.55;
      const ringRadiusY = TILE_SIZE * 0.22;
      const rangeRadiusScale = 1 + 0.04 * rangePulse;
      const rangeEdgeAlpha = 0.84 + 0.12 * rangePulse;
      const rangeFillAlpha = 0.12 + 0.05 * rangePulse;
      for (const cell of cells) {
        if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
          continue;
        }
        const world = cellToWorld(cell.x, cell.y);
        const baseY = world.y + TILE_SIZE * 0.22;
        gfx.fillStyle(glowColor, glowAlpha);
        gfx.fillEllipse(world.x, baseY, ringRadiusX * 2, ringRadiusY * 2);
        gfx.lineStyle(3, glowColor, innerOutlineAlpha);
        gfx.strokeEllipse(world.x, baseY, ringRadiusX * 2, ringRadiusY * 2);
        const tower = this.getTowerAtCell(cell.x, cell.y);
        if (tower) {
          const rangeColor = getTowerProjectileColor(tower.type);
          this._drawSolidRangeCircle(
            gfx,
            tower.x,
            tower.y,
            tower.range * rangeRadiusScale,
            rangeColor,
            rangeEdgeAlpha,
            rangeFillAlpha,
          );
          const splashTiles = getMaxSplashRadiusTilesFromEffects(tower.effects ?? []);
          if (splashTiles > 0) {
            this._drawDashedRangeCircle(gfx, tower.x, tower.y, toWorldRange(splashTiles), rangeColor, 0.4);
          }
        }
      }
      return;
    }
    if (selected.kind === "barracks") {
      const world = cellToWorld(selected.cellX, selected.cellY);
      const shadowW = BARRACKS_CLICK_WIDTH * 0.9;
      const shadowH = BARRACKS_CLICK_HEIGHT * 0.28;
      const time = this.time?.now ?? 0;
      const pulse = 0.7 + 0.3 * Math.sin(time / 220);
      const glowColor = cozyTheme.colors.panelBorder ?? 0xbda67a;
      gfx.fillStyle(glowColor, 0.28);
      gfx.fillEllipse(world.x, world.y + TILE_SIZE * 0.26, shadowW, shadowH);
      gfx.lineStyle(3, glowColor, 0.45 * pulse + 0.35);
      gfx.strokeEllipse(world.x, world.y + TILE_SIZE * 0.26, shadowW, shadowH);
    }
  }

  /**
   * @param {Phaser.GameObjects.Graphics} gfx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} color
   * @param {number} alpha
   */
  _drawDashedRangeCircle(gfx, cx, cy, radius, color, alpha) {
    if (!gfx || !(radius > 0)) {
      return;
    }
    const segmentCount = 36;
    const arcSpan = (Math.PI * 2) / segmentCount;
    const dashSpan = arcSpan * 0.6;
    gfx.lineStyle(2, color, alpha);
    for (let i = 0; i < segmentCount; i += 1) {
      const startAngle = i * arcSpan;
      gfx.beginPath();
      gfx.arc(cx, cy, radius, startAngle, startAngle + dashSpan, false);
      gfx.strokePath();
    }
  }

  /**
   * @param {Phaser.GameObjects.Graphics} gfx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} color
   * @param {number} edgeAlpha
   * @param {number} fillAlpha
   */
  _drawSolidRangeCircle(gfx, cx, cy, radius, color, edgeAlpha, fillAlpha) {
    if (!gfx || !(radius > 0)) {
      return;
    }
    gfx.fillStyle(color, Phaser.Math.Clamp(fillAlpha, 0, 1));
    gfx.fillCircle(cx, cy, radius);
    gfx.lineStyle(2, color, Phaser.Math.Clamp(edgeAlpha, 0, 1));
    gfx.strokeCircle(cx, cy, radius);
  }

  /**
   * @param {Record<string, unknown>} selected
   * @returns {string | null}
   */
  _getSelectionPulseKey(selected) {
    if (!selected || typeof selected !== "object") {
      return null;
    }
    if (selected.kind === "tower") {
      if (this._selectedTowerType && this._selectedTowerCells.length > 0) {
        const signature = this._selectedTowerCells
          .map((cell) => `${cell.x},${cell.y}`)
          .sort()
          .join("|");
        return `tower-group:${this._selectedTowerType}:${signature}`;
      }
      return `tower-single:${selected.cellX},${selected.cellY}:${selected.type}`;
    }
    if (selected.kind === "barracks") {
      return `barracks:${selected.cellX},${selected.cellY}:${selected.label ?? ""}`;
    }
    return null;
  }

  /**
   * @param {number} worldX
   * @param {number} worldY
   * @returns {boolean}
   */
  applyHudDisplayPreferences() {
    const { hudScale } = getDisplaySettings();
    this.hud?.setUiTransform?.({ scale: hudScale });
    const overlayScale = Number.isFinite(hudScale) && hudScale > 0 ? hudScale : 1;
    this._pauseOverlayRoot?.setScale(overlayScale);
    this._runEndOverlayRoot?.setScale(overlayScale);
    this._layoutPauseOverlay();
    this._layoutRunEndOverlay();
  }

  applyDefaultBlueBarracksSelection() {
    if (this.editor?.enabled) {
      return;
    }
    const c = this.map?.points?.homeBarracks;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      return;
    }
    this.selectedBuilding = {
      kind: "barracks",
      label: "Blue Barracks",
      cellX: c.x,
      cellY: c.y,
      hpCurrent: this.gameState.lives,
      hpMax: STARTING_LIVES,
    };
    this.setHudActionMode("barracksMain");
    this.redrawSelectionOutline();
  }

  reselectBlueBarracks() {
    this.applyDefaultBlueBarracksSelection();
    this.updateHudActions();
    this.hud?.render?.(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
    this.redrawSelectionOutline();
  }

  selectBarracksAtWorld(worldX, worldY) {
    const candidates = [
      {
        key: "barracks_blue",
        label: "Blue Barracks",
        cell: this.map.points?.homeBarracks ?? null,
      },
      {
        key: "barracks_red",
        label: "Red Barracks",
        cell: this.map.points?.enemyBarracks ?? null,
      },
    ];
    const halfW = BARRACKS_CLICK_WIDTH / 2;
    const halfH = BARRACKS_CLICK_HEIGHT / 2;
    for (const candidate of candidates) {
      const c = candidate.cell;
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        continue;
      }
      const pos = cellToWorld(c.x, c.y);
      const inBounds =
        worldX >= pos.x - halfW && worldX <= pos.x + halfW && worldY >= pos.y - halfH && worldY <= pos.y + halfH;
      if (!inBounds) {
        continue;
      }
      if (candidate.key === "barracks_blue") {
        this.selectedBuilding = {
          kind: "barracks",
          label: "Blue Barracks",
          cellX: c.x,
          cellY: c.y,
          hpCurrent: this.gameState.lives,
          hpMax: STARTING_LIVES,
        };
      } else {
        this.selectedBuilding = {
          kind: "barracks",
          label: "Red Barracks",
          cellX: c.x,
          cellY: c.y,
        };
      }
      return true;
    }
    return false;
  }

  setHudActionMode(mode) {
    this._hudActionMode = mode;
    this.updateHudActions();
  }

  /**
   * Converts coordinate-addressed actions into the 10-slot HUD array (1×10).
   * @param {HudActionPlacement[]} actionDefs
   * @returns {(Record<string, unknown> | null)[]}
   */
  buildHudActionSlots(actionDefs = []) {
    const rows = 1;
    const cols = 10;
    const totalSlots = rows * cols;
    const slots = Array.from({ length: totalSlots }, () => null);
    const usedCoords = new Set();

    for (const def of actionDefs) {
      if (!def || typeof def !== "object") {
        continue;
      }
      const row = Number(def.innerRow);
      const col = Number(def.innerCol);
      const rowValid = Number.isInteger(row) && row >= 1 && row <= rows;
      const colValid = Number.isInteger(col) && col >= 1 && col <= cols;
      if (!rowValid || !colValid) {
        console.warn("[HUD] Ignoring action with invalid coordinates:", def);
        continue;
      }
      const key = `${row},${col}`;
      if (usedCoords.has(key)) {
        console.warn("[HUD] Ignoring duplicate action coordinate:", key, def);
        continue;
      }
      usedCoords.add(key);

      const slotIndex = (row - 1) * cols + (col - 1);
      if (typeof def.actionId !== "string" || def.actionId.length === 0) {
        console.warn("[HUD] Ignoring action without actionId:", def);
        continue;
      }
      slots[slotIndex] = {
        label: typeof def.label === "string" ? def.label : "",
        enabled: def.enabled !== false,
        onClick: () => this.handleHudAction(def.actionId),
        iconKey: typeof def.iconKey === "string" ? def.iconKey : undefined,
        iconOffsetX: typeof def.iconOffsetX === "number" ? def.iconOffsetX : undefined,
        iconOffsetY: typeof def.iconOffsetY === "number" ? def.iconOffsetY : undefined,
        tooltipTitle: typeof def.tooltipTitle === "string" ? def.tooltipTitle : undefined,
        tooltipDescription: typeof def.tooltipDescription === "string" ? def.tooltipDescription : undefined,
        tooltipCost: typeof def.tooltipCost === "number" ? def.tooltipCost : def.tooltipCost === null ? null : undefined,
        tooltipResource: typeof def.tooltipResource === "string" ? def.tooltipResource : undefined,
        tooltipWarning: typeof def.tooltipWarning === "string" ? def.tooltipWarning : undefined,
        accentColor: typeof def.accentColor === "number" ? def.accentColor : undefined,
        cost: typeof def.cost === "number" ? def.cost : def.cost === null ? null : undefined,
        showInfoButton: def.showInfoButton !== false,
      };
    }
    return slots;
  }

  updateHudActions() {
    if (!this.hud) {
      return;
    }
    if (this._pendingPlacement?.type === "tower") {
      this.hud.setActionSlots([]);
      return;
    }
    const selected = this.selectedBuilding;
    if (!selected) {
      if (!this.editor?.enabled) {
        this.applyDefaultBlueBarracksSelection();
        this.hud.setActionSlots(this.buildHudActionSlots([
          {
            innerRow: 1,
            innerCol: 1,
            actionId: "craftTower",
            label: "",
            enabled: this.gameState.gold >= this.towerSystem.towerCost,
            iconKey: "buildIcon06",
            tooltipTitle: "Build Basic Tower",
            tooltipDescription: `${getTowerDescription("basic")} ${getTowerTooltipSummary("basic")}`,
            tooltipCost: this.towerSystem.towerCost,
            tooltipResource: "gold",
            tooltipWarning: this.gameState.gold >= this.towerSystem.towerCost ? "" : "Not enough gold",
            accentColor: getTowerUiAccentColor("basic"),
            cost: this.towerSystem.towerCost,
          },
        ]));
      } else {
        this.hud.setActionSlots([]);
      }
      return;
    }
    if (selected.kind === "barracks" && selected.label === "Blue Barracks") {
      const canAffordTower = this.gameState.gold >= this.towerSystem.towerCost;
      this.hud.setActionSlots(this.buildHudActionSlots([
        {
          innerRow: 1,
          innerCol: 1,
          actionId: "craftTower",
          label: "",
          enabled: canAffordTower,
          iconKey: "buildIcon06",
          tooltipTitle: "Build Basic Tower",
          tooltipDescription: `${getTowerDescription("basic")} ${getTowerTooltipSummary("basic")}`,
          tooltipCost: this.towerSystem.towerCost,
          tooltipResource: "gold",
          tooltipWarning: canAffordTower ? "" : "Not enough gold",
          accentColor: getTowerUiAccentColor("basic"),
          cost: this.towerSystem.towerCost,
        },
      ]));
      return;
    }
    if (selected.kind === "tower") {
      const tower = this.getTowerAtCell(selected.cellX, selected.cellY);
      const options = this.towerSystem.getUpgradeOptions(tower);
      if (tower?.type === "basic") {
        const conversionByType = new Map();
        for (const option of options) {
          if (!option?.id?.startsWith?.("convert:")) {
            continue;
          }
          const type = option.id.slice("convert:".length);
          conversionByType.set(type, option);
        }
        const conversionIconByType = {
          archer: "tower_archer_icon",
          lightning: "tower_lightning_icon",
          earth: "tower_earth_icon",
          fire: "tower_fire_icon",
          holy: "tower_holy_icon",
          ice: "tower_ice_icon",
          dark: "tower_dark_icon",
          nature: "tower_nature_icon",
        };
        const gridCells = [
          { innerRow: 1, innerCol: 1, towerType: "archer" },
          { innerRow: 1, innerCol: 2, towerType: "lightning" },
          { innerRow: 1, innerCol: 3, towerType: "earth" },
          { innerRow: 1, innerCol: 4, towerType: "dark" },
          { innerRow: 1, innerCol: 5, towerType: "fire" },
          { innerRow: 1, innerCol: 6, towerType: "ice" },
          { innerRow: 1, innerCol: 7, towerType: "holy" },
          { innerRow: 1, innerCol: 8, towerType: "nature" },
        ];
        const actionDefs = [];
        for (const cell of gridCells) {
          const iconKey = conversionIconByType[cell.towerType];
          if (!BASIC_CONVERSION_ORDER.includes(cell.towerType)) {
            continue;
          }
          const option = conversionByType.get(cell.towerType);
          if (!option) {
            continue;
          }
          const conversionButtonLabel = getTowerDisplayName(cell.towerType).replace(/ Tower$/, "");
          actionDefs.push({
            innerRow: cell.innerRow,
            innerCol: cell.innerCol,
            actionId: `upgrade:${option.id}`,
            label: conversionButtonLabel.length <= 5 ? conversionButtonLabel : "",
            enabled: this.gameState.gold >= option.cost,
            iconKey,
            tooltipTitle: getTowerDisplayName(cell.towerType),
            tooltipDescription: `${getTowerDescription(cell.towerType)} ${getTowerTooltipSummary(cell.towerType)}`,
            tooltipCost: option.cost,
            tooltipResource: "gold",
            tooltipWarning: this.gameState.gold >= option.cost ? "" : "Not enough gold",
            accentColor: getTowerUiAccentColor(cell.towerType),
            cost: option.cost,
          });
        }
        actionDefs.push({
          innerRow: 1,
          innerCol: 9,
          actionId: "sellTower",
          label: "",
          enabled: true,
          iconKey: "sellIcon03",
          tooltipTitle: "Sell Tower",
          tooltipDescription: "Remove this tower and receive a gold refund.",
          tooltipCost: null,
          tooltipResource: "gold",
          showInfoButton: false,
          cost: null,
        });
        this.hud.setActionSlots(this.buildHudActionSlots(actionDefs));
        return;
      }
      const upgradeIconByType = {
        archer: "tower_archer_icon",
        lightning: "tower_lightning_icon",
        earth: "tower_earth_icon",
        fire: "tower_fire_icon",
        holy: "tower_holy_icon",
        ice: "tower_ice_icon",
        dark: "tower_dark_icon",
        nature: "tower_nature_icon",
      };
      const upgradeIconKey = upgradeIconByType[tower?.type];
      const actionDefs = [{
        innerRow: 1,
        innerCol: 9,
        actionId: "sellTower",
        label: "",
        enabled: true,
        iconKey: "sellIcon03",
        tooltipTitle: "Sell Tower",
        tooltipDescription: "Remove this tower and receive a gold refund.",
        tooltipCost: null,
        tooltipResource: "gold",
        showInfoButton: false,
        cost: null,
      }];
      const nextOption = options[0] ?? null;
      if (nextOption) {
        const summary = typeof nextOption.summary === "string" && nextOption.summary.length > 0
          ? ` ${nextOption.summary}`
          : "";
        const warningParts = [];
        if (nextOption.isHighInvestment) {
          warningParts.push(`Upgrade III (${nextOption.cost}g): High investment, optional.`);
        }
        if (this.gameState.gold < nextOption.cost) {
          warningParts.push("Not enough gold");
        }
        const upgradeDescription = `${getTowerDescription(tower?.type)} ${getTowerTooltipSummary(tower?.type)} Upgrade to ${nextOption.label}.${summary}`;
        actionDefs.push({
          innerRow: 1,
          innerCol: 1,
          actionId: `upgrade:${nextOption.id}`,
          label: nextOption.label,
          enabled: this.gameState.gold >= nextOption.cost,
          iconKey: upgradeIconKey,
          tooltipTitle: `Upgrade to ${nextOption.label}`,
          tooltipDescription: upgradeDescription,
          tooltipCost: nextOption.cost,
          tooltipResource: "gold",
          tooltipWarning: warningParts.join(" "),
          accentColor: getTowerUiAccentColor(tower?.type),
          cost: nextOption.cost,
        });
      } else {
        actionDefs.push({
          innerRow: 1,
          innerCol: 1,
          actionId: "upgradeMaxed",
          label: "Max level",
          enabled: false,
          iconKey: upgradeIconKey,
          tooltipTitle: "Max level",
          tooltipDescription: `${getTowerDescription(tower?.type)} ${getTowerTooltipSummary(tower?.type)} This tower is fully upgraded.`,
          tooltipCost: null,
          tooltipResource: "gold",
          accentColor: getTowerUiAccentColor(tower?.type),
          cost: null,
        });
      }
      this.hud.setActionSlots(this.buildHudActionSlots(actionDefs));
      return;
    }
    this.hud.setActionSlots([]);
  }

  handleHudAction(action) {
    if (action === "craftTower") {
      if (this.gameState.gold < this.towerSystem.towerCost) {
        return;
      }
      this.startTowerPlacement({ preserveSelection: true, returnMode: "barracksMain" });
      return;
    }
    if (action.startsWith("upgrade:") && this.selectedBuilding?.kind === "tower") {
      const optionId = action.slice("upgrade:".length);
      const upgraded = this.tryUpgradeTowerSelection(optionId);
      if (upgraded) {
        this.refreshSelectionAndHudAfterUpgrade();
      }
      return;
    }
    if (action === "clearSelection") {
      this.clearTowerGroupSelection();
      this.reselectBlueBarracks();
      return;
    }
    if (action === "sellTower" && this.selectedBuilding?.kind === "tower") {
      const refund = this.towerSystem.removeTowerAtCell(this.selectedBuilding.cellX, this.selectedBuilding.cellY);
      if (refund > 0) {
        this.gameState.gold += refund;
        this.clearTowerGroupSelection();
        this.debugOverlay.redraw();
        this.reselectBlueBarracks();
      }
    }
  }

  startTowerPlacement({ preserveSelection = false, returnMode = null } = {}) {
    this._pendingPlacement = { type: "tower", towerType: "basic" };
    this._placementReturnMode = returnMode;
    this._hudActionMode = "empty";
    if (!preserveSelection) {
      this.selectedBuilding = null;
      this.clearTowerGroupSelection();
    }
    this.redrawSelectionOutline();
    const pointer = this.input.activePointer;
    const effectsParent = this.effectsWorldLayer ?? this.worldRoot;
    this._placementValidityGfx = this.add.graphics();
    this._placementValidityGfx.setDepth(17);
    if (effectsParent) {
      effectsParent.add(this._placementValidityGfx);
    }
    this._placementRangeGfx = this.add.graphics();
    this._placementRangeGfx.setDepth(17);
    if (effectsParent) {
      effectsParent.add(this._placementRangeGfx);
    }
    if (this.textures.exists("blueTower")) {
      this._towerGhost = this.add.image(pointer.worldX, pointer.worldY, "blueTower");
      this._towerGhost.setOrigin(0.5, 1);
      this._towerGhost.setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
      this._towerGhost.setDepth(19);
      this._towerGhost.setAlpha(0.7);
    } else {
      this._towerGhost = this.add.rectangle(pointer.worldX, pointer.worldY, TILE_SIZE, TILE_SIZE * 2, 0x3d69d6, 0.7);
      this._towerGhost.setOrigin(0.5, 1);
      this._towerGhost.setDepth(19);
    }
    const towerParent = this.towersWorldLayer ?? this.worldRoot;
    if (towerParent) {
      towerParent.add(this._towerGhost);
    }
    this.updateHudActions();
  }

  clearTowerPlacement() {
    this._pendingPlacement = null;
    this._towerGhost?.destroy?.();
    this._towerGhost = null;
    this._placementValidityGfx?.destroy?.();
    this._placementValidityGfx = null;
    this._placementRangeGfx?.destroy?.();
    this._placementRangeGfx = null;
    this._placementReturnMode = null;
  }

  /**
   * @param {string} optionId
   * @returns {boolean}
   */
  tryUpgradeTowerSelection(optionId) {
    if (this.selectedBuilding?.kind !== "tower") {
      return false;
    }
    const isGroupSelection = this._selectedTowerCells.length > 1;
    if (!isGroupSelection) {
      return this.towerSystem.tryUpgradeTowerAtCell(
        this.selectedBuilding.cellX,
        this.selectedBuilding.cellY,
        this.gameState,
        optionId,
      );
    }
    const shuffledCells = [...this._selectedTowerCells];
    for (let i = shuffledCells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffledCells[i];
      shuffledCells[i] = shuffledCells[j];
      shuffledCells[j] = tmp;
    }
    let upgradedAny = false;
    let firstUpgradedCell = null;
    for (const cell of shuffledCells) {
      if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
        continue;
      }
      const tower = this.getTowerAtCell(cell.x, cell.y);
      if (!tower) {
        continue;
      }
      const option = this.towerSystem.getUpgradeOptions(tower).find((entry) => entry.id === optionId);
      if (!option || this.gameState.gold < option.cost) {
        continue;
      }
      const upgraded = this.towerSystem.tryUpgradeTowerAtCell(cell.x, cell.y, this.gameState, optionId);
      if (!upgraded) {
        continue;
      }
      if (!firstUpgradedCell) {
        firstUpgradedCell = cell;
      }
      upgradedAny = true;
    }
    if (upgradedAny && firstUpgradedCell) {
      this.selectedBuilding.cellX = firstUpgradedCell.x;
      this.selectedBuilding.cellY = firstUpgradedCell.y;
    }
    return upgradedAny;
  }

  refreshSelectionAndHudAfterUpgrade() {
    const tower = this.towerSystem.getTowerAtCell(this.selectedBuilding.cellX, this.selectedBuilding.cellY);
    if (tower) {
      this.selectedBuilding.type = tower.type;
      this.selectedBuilding.tier = tower.tier;
      this.selectedBuilding.label = getTowerDisplayName(tower.type);
      this.selectedBuilding.iconKey = getTowerTextureKey(tower.type);
      this.selectedBuilding.damage = tower.damage;
      this.selectedBuilding.cooldown = tower.cooldown;
      this.selectedBuilding.range = tower.range;
      this.selectedBuilding.effects = tower.effects ?? [];
      this.selectedBuilding.effectSummary = getTowerEffectShortSummary(tower.effects ?? []);
      if (this._selectedTowerType && this._selectedTowerType !== tower.type) {
        this.clearTowerGroupSelection();
        this.selectedBuilding.selectedCount = 1;
      } else {
        this.refreshTowerGroupSelection();
      }
    }
    this.debugOverlay.redraw();
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
    this.updateHudActions();
    this.redrawSelectionOutline();
  }

  updateTowerGhost(pointer) {
    if (!this._pendingPlacement || !this._towerGhost) {
      return;
    }
    const cell = this.pointerToCell(pointer);
    const validityGfx = this._placementValidityGfx;
    const rangeGfx = this._placementRangeGfx;
    if (!cell) {
      this._towerGhost.setVisible(false);
      validityGfx?.clear();
      rangeGfx?.clear();
      return;
    }
    this._towerGhost.setVisible(true);
    const world = cellToWorld(cell.x, cell.y);
    this._towerGhost.setPosition(world.x, world.y + TILE_SIZE / 2);

    const valid = this.towerSystem.canPlaceTowerAtCell(cell.x, cell.y, this.gameState);
    if (typeof this._towerGhost.setTint === "function") {
      if (valid) {
        this._towerGhost.clearTint();
      } else {
        this._towerGhost.setTint(0xff8a8a);
      }
    }
    const tileColor = valid ? 0x7ad858 : 0xff5a1f;
    if (validityGfx) {
      validityGfx.clear();
      validityGfx.fillStyle(tileColor, 0.35);
      validityGfx.fillRect(world.x - TILE_SIZE / 2, world.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      validityGfx.lineStyle(2, tileColor, 0.85);
      validityGfx.strokeRect(world.x - TILE_SIZE / 2, world.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }
    if (rangeGfx) {
      rangeGfx.clear();
      const baseRange = toWorldRange(towerCatalog.basic.rangeTiles);
      const rangeColor = valid ? (cozyTheme.colors.panelBorder ?? 0xbda67a) : 0xff5a1f;
      this._drawDashedRangeCircle(rangeGfx, world.x, world.y, baseRange, rangeColor, 0.55);
    }
  }

  getWaveInfo() {
    const role = this.waveSystem?.spawner?.waveRole;
    const progress = this.waveSystem?.getProgressInfo?.() ?? {};
    const upcoming = this.waveSystem?.getWaveHudPreview?.() ?? null;
    return {
      role: typeof role === "string" && role.length > 0 ? role : "unknown",
      wave: Number(this.gameState?.wave) || 1,
      enemiesAlive: Number(progress.enemiesAlive) || 0,
      spawnTarget: Number(progress.spawnTarget) || 0,
      totalSpawned: Number(progress.totalSpawned) || 0,
      remainingToSpawn: Number(progress.remainingToSpawn) || 0,
      progress: Number(progress.progress) || 0,
      upcoming,
    };
  }

  syncEnemyBarracksTargets() {
    this.enemySystem.syncFromMap(this.map);
    this.enemySystem.setBarracksTargets(this.map.points.enemyBarracks, this.map.points.homeBarracks);
    this.debugOverlay.redraw();
  }

  syncHudForEditorMode({ clampCamera = true } = {}) {
    const editorEnabled = Boolean(this.editor?.enabled);
    this.hud?.setTopVisible(true);
    this.hud?.setBottomVisible(!editorEnabled);
    if (clampCamera) {
      this._clampCameraScroll();
    }
  }

  _clampCameraScroll() {
    const cam = this.cameras.main;
    const margins = this.hud?.getOcclusionMargins?.() ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const visW = Math.max(1, (cam.width - margins.left - margins.right) / cam.zoom);
    const visH = Math.max(1, (cam.height - margins.top - margins.bottom) / cam.zoom);
    const leftVisible = margins.left / cam.zoom;
    const topVisible = margins.top / cam.zoom;
    const minSX = Math.min(0, this._mapPixelW - visW) - leftVisible;
    const maxSX = Math.max(0, this._mapPixelW - visW) - leftVisible;
    const minSY = Math.min(0, this._mapPixelH - visH) - topVisible;
    const maxSY = Math.max(0, this._mapPixelH - visH) - topVisible;
    const beforeX = cam.scrollX;
    const beforeY = cam.scrollY;
    const clampedX = CAMERA_VERTICAL_ONLY ? DEFAULT_CAMERA_SCROLL_X : Phaser.Math.Clamp(beforeX, minSX, maxSX);
    const clampedY = Phaser.Math.Clamp(beforeY, minSY, maxSY);
    cam.setScroll(clampedX, clampedY);
    this._syncHudCameraTelemetry();
  }

  _syncHudCameraTelemetry() {
    const cam = this.cameras?.main;
    if (!cam || !this.hud?.setCameraTelemetry) {
      return;
    }
    this.hud.setCameraTelemetry({
      zoom: cam.zoom,
      x: cam.scrollX,
      y: cam.scrollY,
    });
  }

  _applyInitialCameraPose() {
    this.cameras.main.setZoom(DEFAULT_CAMERA_ZOOM);
    this.cameras.main.setScroll(DEFAULT_CAMERA_SCROLL_X, DEFAULT_CAMERA_SCROLL_Y);
    // Intentionally do not clamp here: user expects exact startup pose.
    this._syncHudCameraTelemetry();
  }

  _startIntroCameraPan() {
    if (this.editor?.enabled) {
      this._applyInitialCameraPose();
      return;
    }
    const cam = this.cameras.main;
    cam.setZoom(DEFAULT_CAMERA_ZOOM);
    cam.setScroll(DEFAULT_CAMERA_SCROLL_X, INTRO_CAMERA_SCROLL_Y);
    this._syncHudCameraTelemetry();
    this._introCameraPanActive = true;
    this._introCameraTween?.remove?.();
    this._introCameraTween = this.tweens.add({
      targets: cam,
      scrollY: DEFAULT_CAMERA_SCROLL_Y,
      duration: INTRO_CAMERA_PAN_MS,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this._introCameraTween = null;
        this._introCameraPanActive = false;
        this._syncHudCameraTelemetry();
        this._clampCameraScroll();
      },
    });
  }

  _cancelIntroCameraPan() {
    if (!this._introCameraPanActive && !this._introCameraTween) {
      return;
    }
    this._introCameraTween?.remove?.();
    this._introCameraTween = null;
    this._introCameraPanActive = false;
    this._syncHudCameraTelemetry();
    this._clampCameraScroll();
  }

  handleResize(size) {
    const width = Math.max(1, Number(size?.width) || this.scale.width || GAME_WIDTH);
    const height = Math.max(1, Number(size?.height) || this.scale.height || GAME_HEIGHT);
    const viewportProfile = getViewportProfile(width, height);
    this.cameras.main.setViewport(0, 0, width, height);
    this.uiCamera?.setViewport?.(0, 0, width, height);
    if (viewportProfile.isPortrait && this.cameras.main.zoom > 0.82) {
      this.cameras.main.setZoom(0.82);
    }
    if (viewportProfile.isLandscape && this.cameras.main.zoom < 0.7) {
      this.cameras.main.setZoom(0.7);
    }
    this.hud?.setViewportMode?.(viewportProfile.isPortrait ? "portrait" : "landscape");
    this.hud?.layout?.(width, height);
    this._layoutPauseOverlay();
    this._layoutRunEndOverlay();
    if (!this._introCameraPanActive) {
      this._clampCameraScroll();
    } else {
      this._syncHudCameraTelemetry();
    }
  }

  /**
   * @param {Phaser.Input.Pointer} pointer
   * @returns {boolean}
   */
  _isPanPointer(pointer) {
    const ev = /** @type {MouseEvent | undefined} */ (pointer.event);
    const buttons = typeof ev?.buttons === "number" ? ev.buttons : 0;
    return pointer.middleButtonDown() || (buttons & 4) === 4;
  }

  unbindInput() {
    if (this._boundPointerDown) {
      this.input.off("pointerdown", this._boundPointerDown);
      this._boundPointerDown = null;
    }
    if (this._boundPointerMove) {
      this.input.off("pointermove", this._boundPointerMove);
      this._boundPointerMove = null;
    }
    if (this._boundPointerUp) {
      this.input.off("pointerup", this._boundPointerUp);
      this._boundPointerUp = null;
    }
    if (this._boundWheel) {
      this.input.off("wheel", this._boundWheel);
      this._boundWheel = null;
    }
    const kb = this.input.keyboard;
    if (kb && this._boundKeyDebug) {
      kb.off("keydown-G", this._boundKeyDebug);
      this._boundKeyDebug = null;
    }
    if (kb && this._boundKeyHudDebug) {
      kb.off("keydown-F3", this._boundKeyHudDebug);
      this._boundKeyHudDebug = null;
    }
    if (kb && this._boundKeyPause) {
      kb.off("keydown-P", this._boundKeyPause);
      this._boundKeyPause = null;
    }
    if (kb && this._boundKeyRestart) {
      kb.off("keydown-R", this._boundKeyRestart);
      this._boundKeyRestart = null;
    }
    if (kb && this._boundKeyAdaptive) {
      kb.off("keydown-O", this._boundKeyAdaptive);
      this._boundKeyAdaptive = null;
    }
    if (kb && this._boundKeyEditor) {
      kb.off("keydown-E", this._boundKeyEditor);
      this._boundKeyEditor = null;
    }
    if (kb && this._onGameplayKeyDown) {
      kb.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._onGameplayKeyDown);
      this._onGameplayKeyDown = null;
    }
  }

  bindInput() {
    this._boundPointerDown = (pointer) => {
      if (this._isPanPointer(pointer)) {
        const ev = /** @type {MouseEvent | undefined} */ (pointer.event);
        ev?.preventDefault();
        this._cancelIntroCameraPan();
        this._cameraPanning = true;
        this._lastPanX = pointer.x;
        this._lastPanY = pointer.y;
        return;
      }
      if (this.editor.handlePointerDown(pointer)) {
        return;
      }
      if (this.gameState.paused) {
        return;
      }
      if (this.hud?.isPointBlockedByHud?.(pointer.x, pointer.y)) {
        return;
      }
      if (this._pendingPlacement?.type === "tower") {
        const cell = this.pointerToCell(pointer);
        if (!cell) {
          return;
        }
        const placed = this.builderSystem.startTowerBuild(cell.x, cell.y, this._pendingPlacement.towerType, this.gameState);
        if (!placed) {
          return;
        }
        const returnMode = this._placementReturnMode;
        this.clearTowerPlacement();
        this.setHudActionMode(returnMode ?? "empty");
        this.debugOverlay.redraw();
        this.hud.render(
          this.gameState,
          this.towerSystem.towers.length,
          STARTING_LIVES,
          this.selectedBuilding,
          this.getWaveInfo(),
        );
        return;
      }
      const cell = this.pointerToCell(pointer);
      const clickedTower = cell ? this.getTowerAtCell(cell.x, cell.y) : null;
      let selectedTower = false;
      if (cell && clickedTower) {
        const now = this.time.now;
        const signature = `${cell.x},${cell.y},${clickedTower.type}`;
        const isDoubleClick =
          this._towerDoubleClick.signature === signature && now - this._towerDoubleClick.at <= TOWER_DOUBLE_CLICK_MS;
        this._towerDoubleClick.signature = signature;
        this._towerDoubleClick.at = now;
        if (isDoubleClick) {
          selectedTower = this.selectTowerGroupByType(clickedTower.type, cell.x, cell.y, clickedTower);
        } else {
          this.clearTowerGroupSelection();
          selectedTower = this.selectBuildingAtCell(cell.x, cell.y);
        }
      } else {
        this._towerDoubleClick.signature = null;
        this._towerDoubleClick.at = 0;
        this.clearTowerGroupSelection();
      }
      const selectedBarracks = selectedTower ? false : this.selectBarracksAtWorld(pointer.worldX, pointer.worldY);
      const selected = selectedTower || selectedBarracks;
      if (selected) {
        if (this.selectedBuilding?.kind === "barracks" && this.selectedBuilding?.label === "Blue Barracks") {
          this.setHudActionMode("barracksMain");
        } else if (this.selectedBuilding?.kind === "tower") {
          this.setHudActionMode("tower");
        } else {
          this.setHudActionMode("empty");
        }
        this.hud.render(
          this.gameState,
          this.towerSystem.towers.length,
          STARTING_LIVES,
          this.selectedBuilding,
          this.getWaveInfo(),
        );
        this.redrawSelectionOutline();
        return;
      }

      this.clearTowerGroupSelection();
      this.reselectBlueBarracks();
    };
    this.input.on("pointerdown", this._boundPointerDown);

    this._boundPointerMove = (pointer) => {
      if (this._cameraPanning && !this._isPanPointer(pointer)) {
        this._cameraPanning = false;
      }
      if (this._cameraPanning) {
        const cam = this.cameras.main;
        const dx = pointer.x - this._lastPanX;
        const dy = pointer.y - this._lastPanY;
        this._lastPanX = pointer.x;
        this._lastPanY = pointer.y;
        if (!CAMERA_VERTICAL_ONLY) {
          cam.scrollX -= dx / cam.zoom;
        } else {
          cam.scrollX = DEFAULT_CAMERA_SCROLL_X;
        }
        cam.scrollY -= dy / cam.zoom;
        this._clampCameraScroll();
        return;
      }
      this.updateTowerGhost(pointer);
      this.editor.handlePointerMove(pointer);
    };
    this.input.on("pointermove", this._boundPointerMove);

    this._boundPointerUp = (pointer) => {
      if (!this._isPanPointer(pointer)) {
        this._cameraPanning = false;
      }
      this.editor.handlePointerUp(pointer);
    };
    this.input.on("pointerup", this._boundPointerUp);

    this._boundWheel = (pointer, _objects, _deltaX, deltaY, deltaZ, event) => {
      const cam = this.cameras?.main;
      // Temporary requirement: disable all mouse-wheel camera behavior.
      // Keep binding in place so we can re-enable quickly later.
      return;
    };
    this.input.on("wheel", this._boundWheel);

    this._boundKeyDebug = () => {
      this.debugOverlay.toggle();
    };
    this.input.keyboard.on("keydown-G", this._boundKeyDebug);
    this._boundKeyHudDebug = () => {
      this.hud?.toggleDebugPanelVisibility?.();
      if (!this.hud?.isDebugPanelVisible() && this.editor.enabled) {
        this.editor.setEnabled(false);
        this._syncAfterMapEditorChange();
      }
    };
    this.input.keyboard.on("keydown-F3", this._boundKeyHudDebug);

    this._boundKeyPause = () => {
      if (this.editor.enabled) {
        return;
      }
      this.togglePause();
    };
    this.input.keyboard.on("keydown-P", this._boundKeyPause);

    this._boundKeyRestart = () => {
      this.scene.restart();
    };
    this.input.keyboard.on("keydown-R", this._boundKeyRestart);

    this._boundKeyAdaptive = () => {
      this._adaptiveEnabled = !this._adaptiveEnabled;
    };
    this.input.keyboard.on("keydown-O", this._boundKeyAdaptive);

    this._boundKeyEditor = () => {
      this.toggleMapEditorFromMenu();
    };
    this.input.keyboard.on("keydown-E", this._boundKeyEditor);

    this._onGameplayKeyDown = (/** @type {KeyboardEvent} */ ev) => {
      const hud = this.hud;
      const store = this.keybindStore;
      if (!hud || !store) {
        return;
      }
      if (hud.isMenuDropdownOpen()) {
        if (ev.keyCode === store.getCode("backOrClose") || ev.key === "Escape") {
          hud.closeMenuDropdown();
          ev.preventDefault();
        }
        return;
      }
      if (ev.keyCode === store.getCode("backOrClose") || ev.key === "Escape") {
        if (this._pauseOverlayOpen) {
          this.togglePause();
          ev.preventDefault();
          return;
        }
        this.handleGameplayBackOrClose();
        ev.preventDefault();
        return;
      }
      if (this.editor.enabled || this.gameState.paused) {
        return;
      }
      if (ev.keyCode === store.getCode("selectBlueBarracks")) {
        const h = this.map.points.homeBarracks;
        if (h && Number.isFinite(h.x) && Number.isFinite(h.y)) {
          this.clearTowerGroupSelection();
          this.selectBuildingAtCell(h.x, h.y);
          if (this.selectedBuilding?.kind === "barracks" && this.selectedBuilding?.label === "Blue Barracks") {
            this.setHudActionMode("barracksMain");
          } else {
            this.setHudActionMode("empty");
          }
          this.hud.render(
            this.gameState,
            this.towerSystem.towers.length,
            STARTING_LIVES,
            this.selectedBuilding,
            this.getWaveInfo(),
          );
        }
        ev.preventDefault();
        return;
      }
      const actionId = store.findActionForCode(ev.keyCode);
      if (actionId && GRID_KEYBIND_ACTION_IDS.includes(actionId)) {
        const slotIndex = GRID_KEYBIND_ACTION_IDS.indexOf(actionId);
        if (slotIndex >= 0) {
          hud.triggerActionSlot(slotIndex);
          ev.preventDefault();
        }
      }
    };
    this.input.keyboard.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._onGameplayKeyDown);
  }

  togglePause() {
    if (this.editor.enabled) {
      return;
    }
    this.gameState.paused = !this.gameState.paused;
    this._pauseOverlayOpen = this.gameState.paused;
    this._pauseOverlayRoot?.setVisible(this._pauseOverlayOpen);
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
    this._syncHudCameraTelemetry();
  }

  createPauseOverlay() {
    this._pauseOverlayRoot?.destroy(true);
    this._pauseOverlayRoot = null;
    this._pauseBackdrop = this.add.rectangle(0, 0, 100, 100, cozyTheme.colors.overlay, 0.65).setOrigin(0, 0);
    this._pausePanel = createCozyPanel(this, 0, 0, 460, 360);
    this._pauseTitle = this.add.text(0, 0, "Paused", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "48px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);
    this._pauseResumeBtn = createCozyButton(this, "Resume", () => this.togglePause(), { width: 220, fontSize: 24 });
    this._pauseSettingsBtn = createCozyButton(this, "Settings", () => this.openSettingsFromGame(), { width: 220, fontSize: 22 });
    this._pauseRestartBtn = createCozyButton(this, "Restart", () => this.scene.restart(), { width: 220, fontSize: 22 });
    this._pauseMenuBtn = createCozyButton(this, "Main Menu", () => this.backToMainMenu(), { width: 220, fontSize: 22 });
    this._pauseOverlayRoot = this.add.container(0, 0, [
      this._pauseBackdrop,
      this._pausePanel,
      this._pauseTitle,
      this._pauseResumeBtn,
      this._pauseSettingsBtn,
      this._pauseRestartBtn,
      this._pauseMenuBtn,
    ]);
    this._pauseOverlayRoot.setDepth(180);
    this._pauseOverlayRoot.setVisible(false);
    this._attachOverlayToUiCamera(this._pauseOverlayRoot);
    this._layoutPauseOverlay();
  }

  _layoutPauseOverlay() {
    if (!this._pauseOverlayRoot || !this._pauseBackdrop) {
      return;
    }
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const hudScale = getDisplaySettings().hudScale;
    const overlayScale = Number.isFinite(hudScale) && hudScale > 0 ? hudScale : 1;
    this._pauseOverlayRoot.setScale(overlayScale);
    this._pauseBackdrop.setSize(width / overlayScale, height / overlayScale);
    const cx = width / (2 * overlayScale);
    const cy = height / (2 * overlayScale);
    const panelW = Math.min(460, Math.round(width * 0.72 / overlayScale));
    const panelH = Math.min(360, Math.round(height * 0.42 / overlayScale));
    this._pausePanel.setPosition(cx, cy);
    this._pausePanel.setSize(panelW, panelH);
    this._pauseTitle.setPosition(cx, cy - panelH * 0.5 + 48);
    this._pauseResumeBtn.setPosition(cx, cy - 35);
    this._pauseSettingsBtn.setPosition(cx, cy + 20);
    this._pauseRestartBtn.setPosition(cx, cy + 75);
    this._pauseMenuBtn.setPosition(cx, cy + 130);
  }

  createRunEndOverlay() {
    this._runEndOverlayRoot?.destroy(true);
    this._runEndOverlayRoot = null;
    this._runEndBackdrop = this.add.rectangle(0, 0, 100, 100, cozyTheme.colors.overlay, 0.72).setOrigin(0, 0);
    this._runEndPanel = createCozyPanel(this, 0, 0, 620, 420);
    this._runEndTitle = this.add.text(0, 0, "Run Complete", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "46px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);
    this._runEndStats = this.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "20px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    }).setOrigin(0.5, 0.5);
    this._runEndRetryBtn = createCozyButton(this, "Retry", () => this.scene.restart(), { width: 220, fontSize: 24 });
    this._runEndMenuBtn = createCozyButton(this, "Back to Menu", () => this.backToMainMenu(), { width: 220, fontSize: 24 });
    this._runEndOverlayRoot = this.add.container(0, 0, [
      this._runEndBackdrop,
      this._runEndPanel,
      this._runEndTitle,
      this._runEndStats,
      this._runEndRetryBtn,
      this._runEndMenuBtn,
    ]);
    this._runEndOverlayRoot.setDepth(185);
    this._runEndOverlayRoot.setVisible(false);
    this._attachOverlayToUiCamera(this._runEndOverlayRoot);
    this._layoutRunEndOverlay();
  }

  _layoutRunEndOverlay() {
    if (!this._runEndOverlayRoot || !this._runEndBackdrop) {
      return;
    }
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const hudScale = getDisplaySettings().hudScale;
    const overlayScale = Number.isFinite(hudScale) && hudScale > 0 ? hudScale : 1;
    this._runEndOverlayRoot.setScale(overlayScale);
    this._runEndBackdrop.setSize(width / overlayScale, height / overlayScale);
    const cx = width / (2 * overlayScale);
    const cy = height / (2 * overlayScale);
    const panelW = Math.min(620, Math.round(width * 0.86 / overlayScale));
    const panelH = Math.min(420, Math.round(height * 0.48 / overlayScale));
    this._runEndPanel.setPosition(cx, cy);
    this._runEndPanel.setSize(panelW, panelH);
    this._runEndTitle.setPosition(cx, cy - panelH * 0.5 + 56);
    this._runEndStats.setPosition(cx, cy - 20);
    const btnY = cy + panelH * 0.5 - 72;
    const btnSpread = Math.min(120, panelW * 0.22);
    this._runEndRetryBtn.setPosition(cx - btnSpread, btnY);
    this._runEndMenuBtn.setPosition(cx + btnSpread, btnY);
  }

  /**
   * Ensure modal overlays render only once through the UI camera.
   * @param {Phaser.GameObjects.GameObject | Phaser.GameObjects.Container | null} overlayRoot
   */
  _attachOverlayToUiCamera(overlayRoot) {
    if (!overlayRoot) {
      return;
    }
    this.cameras.main?.ignore?.(overlayRoot);
  }

  openSettingsFromGame() {
    if (this.scene.isActive("settings")) {
      this.scene.bringToTop("settings");
      return;
    }
    this.registry.set("settingsReturnScene", "game");
    this._settingsReturnToPause = this._pauseOverlayOpen;
    if (this.hud?.isMenuDropdownOpen?.()) {
      this.hud.closeMenuDropdown();
    }
    this.scene.pause();
    this.scene.launch("settings");
    this.scene.bringToTop("settings");
  }

  onReturnFromSettings() {
    this.gameState.paused = this._settingsReturnToPause;
    this._pauseOverlayOpen = this._settingsReturnToPause;
    this._pauseOverlayRoot?.setVisible(this._pauseOverlayOpen);
    this._settingsReturnToPause = false;
    this.applyHudDisplayPreferences();
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    this.hud?.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
  }

  backToMainMenu() {
    this.scene.start("main-menu");
  }

  endRun(reason = "defeat") {
    if (this._runEnded) {
      return;
    }
    this._runEnded = true;
    this.gameState.paused = true;
    this._pauseOverlayOpen = false;
    this._pauseOverlayRoot?.setVisible(false);
    const title = reason === "victory" ? "Victory" : "Defeat";
    this._runEndTitle?.setText(title);
    const statsLines = [
      `Waves Survived: ${Math.max(0, Number(this.gameState.wave) || 0)}`,
      `Towers Built: ${this.towerSystem?.towers?.length ?? 0}`,
      `Gold Remaining: ${Math.max(0, Number(this.gameState.gold) || 0)}`,
    ];
    this._runEndStats?.setText(statsLines.join("\n"));
    this._runEndOverlayRoot?.setVisible(true);
  }

  cycleGameSpeed() {
    const cur = Phaser.Math.Clamp(Number(this.gameState.gameSpeed) || 1, 1, 3);
    this.gameState.gameSpeed = cur >= 3 ? 1 : cur + 1;
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
  }

  toggleMapEditorFromMenu() {
    if (!this.editor.enabled && !this.hud?.isDebugPanelVisible()) {
      return;
    }
    this.editor.toggle();
    this._syncAfterMapEditorChange();
  }

  _syncAfterMapEditorChange() {
    this._refreshScaleAfterEditorPanelToggle();
    this.syncHudForEditorMode();
    this.updateHudActions();
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
  }

  _refreshScaleAfterEditorPanelToggle() {
    const refresh = () => {
      this.scale.refresh();
      this.hud?.layout?.();
      this._clampCameraScroll();
    };

    refresh();
    window.requestAnimationFrame(refresh);
  }

  handleGameplayBackOrClose() {
    if (this.editor.enabled) {
      return;
    }
    if (this._pauseOverlayOpen) {
      this.togglePause();
      return;
    }
    if (this._pendingPlacement?.type === "tower") {
      this.clearTowerPlacement();
      if (this.selectedBuilding?.kind === "barracks" && this.selectedBuilding?.label === "Blue Barracks") {
        this.setHudActionMode("barracksMain");
        this.updateHudActions();
        this.hud.render(
          this.gameState,
          this.towerSystem.towers.length,
          STARTING_LIVES,
          this.selectedBuilding,
          this.getWaveInfo(),
        );
      } else {
        this.reselectBlueBarracks();
      }
      return;
    }
    if (this.selectedBuilding?.kind === "tower") {
      this.reselectBlueBarracks();
    }
  }

  redrawTerrain() {
    this.cameras.main.setBackgroundColor(this.map.bgColor);
    this.terrainContainer.removeAll(true);

    const hasSheet = hasTinySwordsFolderHint(this);
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensureMapLayerTiles(this.map);
    ensurePathMaskGrid(this.map);

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const elev = Math.max(0, Math.min(MAP_TILE_LAYER_COUNT - 1, Math.floor(this.map.elevation[y][x] ?? 0)));

        if (!hasSheet) {
          if (elev >= 1) {
            const colors = [0x2d4f7d, 0x7fa05f, 0x8fb665, 0x9fc875];
            const inset = Math.max(0, (elev - 1) * 4);
            const fallback = this.add.rectangle(
              px + TILE_SIZE / 2,
              py + TILE_SIZE / 2,
              TILE_SIZE - inset,
              TILE_SIZE - inset,
              colors[elev] ?? colors[1],
              elev === 1 ? 1 : 0.75,
            );
            fallback.setOrigin(0.5, 0.5);
            fallback.setDepth(elev);
            this.terrainContainer.add(fallback);
          }
          continue;
        }

        for (let layer = 0; layer <= elev; layer += 1) {
          const tile = this.map.layerTiles?.[layer]?.[y]?.[x] ?? null;
          addLayerTileSprite(this, this.terrainContainer, tile, x, y, layer === 3 ? 12 : layer);
        }
      }
    }

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const key = this.map.buildings[y][x];
        if (key == null) {
          continue;
        }
        const pos = cellToWorld(x, y);
        if (key === "barracks_blue") {
          if (hasSheet && this.textures.exists("blueBarracks")) {
            this.terrainContainer.add(this.add.image(pos.x, pos.y, "blueBarracks").setDepth(20));
          } else {
            this.terrainContainer.add(this.add.rectangle(pos.x, pos.y, TILE_SIZE - 8, TILE_SIZE - 8, 0x355bb7).setDepth(20));
          }
        } else if (key === "barracks_red") {
          if (hasSheet && this.textures.exists("redBarracks")) {
            this.terrainContainer.add(this.add.image(pos.x, pos.y, "redBarracks").setDepth(20));
          } else {
            this.terrainContainer.add(this.add.rectangle(pos.x, pos.y, TILE_SIZE - 8, TILE_SIZE - 8, 0xb43b3b).setDepth(20));
          }
        }
      }
    }

    if (this.editor?.enabled && this.map.pathMask) {
      const pathGfx = this.add.graphics();
      pathGfx.fillStyle(0xf5d742, 0.22);
      for (let y = 0; y < this.map.height; y += 1) {
        for (let x = 0; x < this.map.width; x += 1) {
          if (this.map.pathMask[y]?.[x] === 1) {
            pathGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
      pathGfx.setDepth(4);
      this.terrainContainer.add(pathGfx);
    }

    const selectedCells = this.editor?.enabled ? this.editor.getSelectedCells() : [];
    if (selectedCells.length > 0) {
      const selGfx = this.add.graphics();
      selGfx.lineStyle(3, 0xf5d742, 1);
      for (const sel of selectedCells) {
        if (!isInsideGrid(sel.x, sel.y, this.map.width, this.map.height)) {
          continue;
        }
        const sx = sel.x * TILE_SIZE;
        const sy = sel.y * TILE_SIZE;
        selGfx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
      selGfx.setDepth(50);
      this.terrainContainer.add(selGfx);
    }

    const movePick = this.editor?.enabled ? this.editor.getMovePickCell?.() : null;
    if (movePick && isInsideGrid(movePick.x, movePick.y, this.map.width, this.map.height)) {
      const pickedGfx = this.add.graphics();
      const px = movePick.x * TILE_SIZE;
      const py = movePick.y * TILE_SIZE;
      pickedGfx.fillStyle(0x5cb3ff, 0.2);
      pickedGfx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      pickedGfx.lineStyle(3, 0x5cb3ff, 1);
      pickedGfx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      pickedGfx.setDepth(52);
      this.terrainContainer.add(pickedGfx);
    }

    this.debugOverlay?.redraw();
    this.refreshBlueBarracksHpBar();
  }

  refreshBlueBarracksHpBar() {
    this._homeHpBar?.destroy();
    this._homeHpBar = null;
    this.blueBarracksHpRoot.removeAll(true);

    const hb = this.map.points?.homeBarracks;
    if (!hb || typeof hb.x !== "number" || typeof hb.y !== "number") {
      return;
    }
    if (!this.textures.exists("bigBarBase") || !this.textures.exists("bigBarFill")) {
      return;
    }

    const pos = cellToWorld(hb.x, hb.y);
    const api = createBlueBarracksHpBar(this, pos.x, pos.y - blueBarracksHpBarYOffset());
    if (!api) {
      return;
    }
    this.blueBarracksHpRoot.add(api.container);
    this._homeHpBar = api;
    api.setRatio(this.gameState.lives / STARTING_LIVES);
    api.setValues(this.gameState.lives, STARTING_LIVES);
  }

  _getBlueBarracksWorldPosition() {
    const hb = this.map.points?.homeBarracks;
    if (!hb || !Number.isFinite(hb.x) || !Number.isFinite(hb.y)) {
      return null;
    }
    return cellToWorld(hb.x, hb.y);
  }

  _ensureBlueBarracksFireEffect() {
    if (this._blueBarracksFireFx) {
      return;
    }
    const pos = this._getBlueBarracksWorldPosition();
    if (!pos) {
      return;
    }
    if (!this.textures.exists(BLUE_BARRACKS_FIRE_SHEET_KEY)) {
      return;
    }
    const container = this.add.container(pos.x, pos.y).setDepth(35);
    const flameSprites = [];
    for (const point of BLUE_BARRACKS_FIRE_POINTS) {
      const flameSprite = this.add.sprite(point.x, point.y, BLUE_BARRACKS_FIRE_SHEET_KEY, 0);
      flameSprite.setScale(point.scale);
      flameSprite.setAlpha(0.9);
      if (this.anims.exists(BLUE_BARRACKS_FIRE_ANIM_KEY)) {
        flameSprite.play(BLUE_BARRACKS_FIRE_ANIM_KEY);
      }
      container.add(flameSprite);
      flameSprites.push({ sprite: flameSprite, point });
    }
    this.effectsWorldLayer?.add(container);

    const tweens = flameSprites.map(({ sprite, point }, index) =>
      this.tweens.add({
        targets: sprite,
        y: point.y - 3,
        scaleX: point.scale * 1.08,
        scaleY: point.scale * 0.92,
        alpha: 0.96,
        duration: 180 + index * 35,
        yoyo: true,
        repeat: -1,
        delay: index * 40,
      }),
    );
    this._blueBarracksFireFx = { container, tweens };
  }

  _destroyBlueBarracksFireEffect() {
    if (!this._blueBarracksFireFx) {
      return;
    }
    for (const tween of this._blueBarracksFireFx.tweens) {
      tween?.stop?.();
      tween?.remove?.();
    }
    this._blueBarracksFireFx.container?.destroy?.(true);
    this._blueBarracksFireFx = null;
  }

  _updateBlueBarracksFireEffect() {
    if (this.gameState.lives <= BLUE_BARRACKS_FIRE_HP_THRESHOLD) {
      this._ensureBlueBarracksFireEffect();
      const pos = this._getBlueBarracksWorldPosition();
      if (pos && this._blueBarracksFireFx?.container) {
        this._blueBarracksFireFx.container.setPosition(pos.x, pos.y);
      }
      return;
    }
    this._destroyBlueBarracksFireEffect();
  }

  update(_time, delta) {
    syncUnitHpBars(this);
    this.redrawSelectionOutline();
    if (this._runEnded) {
      return;
    }
    if (this.gameState.paused) {
      return;
    }

    const raw = Number(this.gameState.gameSpeed);
    const speed = Number.isFinite(raw) ? Phaser.Math.Clamp(raw, 1, 3) : 1;
    const deltaSeconds = (delta / 1000) * speed;
    this._performance.waveTimer += deltaSeconds;
    this.enemySystem.update(deltaSeconds);
    this.builderSystem?.update?.(deltaSeconds);
    this.waveSystem.update(deltaSeconds);
    this.towerSystem.updateCooldowns(deltaSeconds);
    this.combatSystem.update(deltaSeconds, this.gameState);
    this.gameState.lives = Math.max(0, Math.floor(Number(this.gameState.lives) || 0));

    const { leakEvents, livesDamage } = this.enemySystem.consumeEscapedLeaks();
    if (livesDamage > 0) {
      this.gameState.lives = Math.max(0, this.gameState.lives - livesDamage);
      this._performance.leaksInWave += leakEvents;
      if (this.gameState.lives <= 0) {
        this.endRun("defeat");
        return;
      }
    }

    if (this.waveSystem.isCampaignComplete()) {
      this.endRun("victory");
      return;
    }

    if (this.gameState.wave !== this.waveSystem.waveIndex) {
      this._performance.clearedWaves += 1;
      const livesLostInWave = Math.max(0, this._performance.livesAtWaveStart - this.gameState.lives);
      if (this.gameState.wave === 1 && livesLostInWave === 0) {
        const bonus = Number(economy.wave1FullClearBonusGold);
        if (Number.isFinite(bonus) && bonus > 0) {
          this.gameState.gold += bonus;
        }
      }
      const adjustment = this.computeAdaptiveAdjustment(livesLostInWave);
      this.waveSystem.setAdaptiveAdjustment(adjustment);
      this._performance.waveTimer = 0;
      this._performance.leaksInWave = 0;
      this._performance.livesAtWaveStart = this.gameState.lives;
    }
    this.gameState.wave = this.waveSystem.waveIndex;
    this._homeHpBar?.setRatio(this.gameState.lives / STARTING_LIVES);
    this._homeHpBar?.setValues(this.gameState.lives, STARTING_LIVES);
    this._updateBlueBarracksFireEffect();
    this.refreshTowerGroupSelection();
    this.updateHudActions();
    this._syncHudCameraTelemetry();
    if (this.selectedBuilding?.kind === "barracks" && this.selectedBuilding?.label === "Blue Barracks") {
      this.selectedBuilding.hpCurrent = this.gameState.lives;
      this.selectedBuilding.hpMax = STARTING_LIVES;
    }
    this.hud.render(
      this.gameState,
      this.towerSystem.towers.length,
      STARTING_LIVES,
      this.selectedBuilding,
      this.getWaveInfo(),
    );
  }

  computeAdaptiveAdjustment(livesLostInWave = 0) {
    if (!this._adaptiveEnabled) {
      return { hpScale: 1, speedScale: 1, countOffset: 0 };
    }
    return getAdaptiveAdjustment({
      leaksInWave: this._performance.leaksInWave,
      livesLostInWave,
      waveClearSeconds: this._performance.waveTimer,
    });
  }
}
