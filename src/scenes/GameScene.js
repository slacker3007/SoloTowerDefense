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
import { createTinySwordsAnimations, hasTinySwordsFolderHint } from "../game/assets";
import { createFreshMap001 } from "../game/maps/map-001";
import { deriveLayers } from "../game/maps/elevation";
import {
  cellToWorld,
  getHighGroundFrameIndex,
  getShoreFrameIndex,
  isInsideGrid,
  worldToCell,
} from "../game/maps/tileRules";
import { DEFAULT_TERRAIN_SHEET, normalizeTerrainTileOverride } from "../game/maps/tileOverrideSchema";
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
  getAdaptiveAdjustment,
  getTowerDescription,
  getTowerDisplayName,
  getTowerTooltipSummary,
} from "../game/balance";
import { MapEditor } from "../game/editor/MapEditor";
import { EditorPanel } from "../game/editor/EditorPanel";
import { GRID_KEYBIND_ACTION_IDS, KeybindStore } from "../game/input/KeybindStore.js";
import { ensureMapOverrideGrids, ensureMapTilesets, ensurePathMaskGrid } from "../game/maps/mapUtils";
import { cozyTheme, createCozyButton, createCozyPanel } from "../game/ui/CozyTheme";

/**
 * @param {unknown} ov
 * @returns {{ sheet: string, frame: number } | null}
 */
function resolvedTerrainOverride(ov) {
  return normalizeTerrainTileOverride(ov);
}

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

/**
 * @typedef {Object} HudActionPlacement
 * @property {number} innerRow 1..3 inside the action area
 * @property {number} innerCol 1..4 inside the action area
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
    this._runEnded = false;
    this._pauseOverlayOpen = false;
    this._pauseOverlayRoot = null;
    this._runEndOverlayRoot = null;
    this._settingsReturnToPause = false;
    this._placementReturnMode = null;
  }

  create() {
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
      keybindStore: this.keybindStore,
      onMapEditorFromMenu: () => this.toggleMapEditorFromMenu(),
      onOpenSettings: () => this.openSettingsFromGame(),
      onMainMenu: () => this.backToMainMenu(),
      onKeybindsChanged: () => {},
      onCycleGameSpeed: () => this.cycleGameSpeed(),
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
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT, false, "ui");
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.uiCamera.ignore(this.worldRoot);

    this.bindInput();
    this.createPauseOverlay();
    this.createRunEndOverlay();
    ensureUnitHpOverlay(this);
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

  shutdown() {
    if (this._onGameplayKeyDown) {
      this.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._onGameplayKeyDown);
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
        label: getTowerDisplayName(tower.type),
        cellX,
        cellY,
        damage: tower.damage,
        range: tower.range,
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
      label: getTowerDisplayName(towerType),
      cellX: anchorCellX,
      cellY: anchorCellY,
      damage: tower.damage,
      range: tower.range,
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
    this.selectedBuilding.label = getTowerDisplayName(anchorTower.type);
    this.selectedBuilding.damage = anchorTower.damage;
    this.selectedBuilding.range = anchorTower.range;
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
      return;
    }
    const shadowColor = 0x000000;
    const towerShadowAlpha = 0.26;
    const barracksShadowAlpha = 0.22;
    if (selected.kind === "tower") {
      const cells =
        this._selectedTowerType && this._selectedTowerCells.length > 0
          ? this._selectedTowerCells
          : [{ x: selected.cellX, y: selected.cellY }];
      const shadowRadiusX = TILE_SIZE * 0.42;
      const shadowRadiusY = TILE_SIZE * 0.2;
      for (const cell of cells) {
        if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
          continue;
        }
        const world = cellToWorld(cell.x, cell.y);
        gfx.fillStyle(shadowColor, towerShadowAlpha);
        gfx.fillEllipse(world.x, world.y + TILE_SIZE * 0.22, shadowRadiusX * 2, shadowRadiusY * 2);
      }
      return;
    }
    if (selected.kind === "barracks") {
      const world = cellToWorld(selected.cellX, selected.cellY);
      const shadowW = BARRACKS_CLICK_WIDTH * 0.9;
      const shadowH = BARRACKS_CLICK_HEIGHT * 0.28;
      gfx.fillStyle(shadowColor, barracksShadowAlpha);
      gfx.fillEllipse(world.x, world.y + TILE_SIZE * 0.26, shadowW, shadowH);
    }
  }

  /**
   * @param {number} worldX
   * @param {number} worldY
   * @returns {boolean}
   */
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
   * Converts coordinate-addressed actions into the 12-slot HUD array.
   * @param {HudActionPlacement[]} actionDefs
   * @returns {(Record<string, unknown> | null)[]}
   */
  buildHudActionSlots(actionDefs = []) {
    const rows = 3;
    const cols = 4;
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
      this.hud.setActionSlots([]);
      return;
    }
    if (selected.kind === "barracks" && selected.label === "Blue Barracks") {
      const canAffordTower = this.gameState.gold >= this.towerSystem.towerCost;
      if (this._hudActionMode === "barracksCraftMenu") {
        const slots = this.buildHudActionSlots([
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
          },
          {
            innerRow: 1,
            innerCol: 2,
            actionId: "craftTypeInfo",
            label: `Type: Basic (${this.towerSystem.towerCost}g)`,
            enabled: false,
            tooltipTitle: getTowerDisplayName("basic"),
            tooltipDescription: `${getTowerDescription("basic")} ${getTowerTooltipSummary("basic")}`,
            tooltipCost: this.towerSystem.towerCost,
            tooltipResource: "gold",
            tooltipWarning: canAffordTower ? "" : "Not enough gold",
          },
          {
            innerRow: 3,
            innerCol: 4,
            actionId: "backFromCraft",
            label: "",
            enabled: true,
            iconKey: "hammerIcon08",
            tooltipTitle: "Back",
            tooltipDescription: "Return to the barracks action menu.",
            tooltipCost: null,
            tooltipResource: "gold",
          },
        ]);
        this.hud.setActionSlots(slots);
        return;
      }
      this.hud.setActionSlots(this.buildHudActionSlots([
        {
          innerRow: 1,
          innerCol: 1,
          actionId: "openCraftMenu",
          label: "",
          enabled: true,
          iconKey: "buildIcon01",
          tooltipTitle: "Build Menu",
          tooltipDescription: "Open the tower crafting options for blue barracks.",
          tooltipCost: null,
          tooltipResource: "gold",
        },
        {
          innerRow: 3,
          innerCol: 4,
          actionId: "clearSelection",
          label: "",
          enabled: true,
          iconKey: "hammerIcon08",
          tooltipTitle: "Clear Selection",
          tooltipDescription: "Close the current selection.",
          tooltipCost: null,
          tooltipResource: "gold",
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
        const gridCells = [
          { innerRow: 1, innerCol: 1, towerType: "archer", iconKey: "tower_archer_icon" },
          { innerRow: 1, innerCol: 2, towerType: "lightning", iconKey: "tower_lightning_icon" },
          { innerRow: 1, innerCol: 3, towerType: "earth", iconKey: "tower_earth_icon" },
          { innerRow: 1, innerCol: 4, towerType: "fire", iconKey: "tower_fire_icon" },
          { innerRow: 2, innerCol: 1, towerType: "holy", iconKey: "tower_holy_icon" },
          { innerRow: 2, innerCol: 2, towerType: "ice", iconKey: "tower_ice_icon" },
          { innerRow: 2, innerCol: 3, towerType: "dark", iconKey: "tower_dark_icon" },
          { innerRow: 2, innerCol: 4, towerType: "nature", iconKey: "tower_nature_icon" },
          { innerRow: 3, innerCol: 1, towerType: null },
          { innerRow: 3, innerCol: 2, towerType: null },
        ];
        const actionDefs = [];
        for (const cell of gridCells) {
          if (!cell.towerType) {
            actionDefs.push({
              innerRow: cell.innerRow,
              innerCol: cell.innerCol,
              actionId: "conversionReserved",
              label: "",
              enabled: false,
              iconKey: cell.iconKey,
            });
            continue;
          }
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
            label: conversionButtonLabel,
            enabled: this.gameState.gold >= option.cost,
            iconKey: cell.iconKey,
            tooltipTitle: getTowerDisplayName(cell.towerType),
            tooltipDescription: `${getTowerDescription(cell.towerType)} ${getTowerTooltipSummary(cell.towerType)}`,
            tooltipCost: option.cost,
            tooltipResource: "gold",
            tooltipWarning: this.gameState.gold >= option.cost ? "" : "Not enough gold",
          });
        }
        actionDefs.push({
          innerRow: 3,
          innerCol: 3,
          actionId: "sellTower",
          label: "",
          enabled: true,
          iconKey: "sellIcon03",
          tooltipTitle: "Sell Tower",
          tooltipDescription: "Remove this tower and receive a gold refund.",
          tooltipCost: null,
          tooltipResource: "gold",
        });
        actionDefs.push({
          innerRow: 3,
          innerCol: 4,
          actionId: "clearSelection",
          label: "Back",
          enabled: true,
          tooltipTitle: "Back",
          tooltipDescription: "Close this tower menu.",
          tooltipCost: null,
          tooltipResource: "gold",
        });
        this.hud.setActionSlots(this.buildHudActionSlots(actionDefs));
        return;
      }
      const actionDefs = [{
        innerRow: 1,
        innerCol: 1,
        actionId: "sellTower",
        label: "",
        enabled: true,
        iconKey: "sellIcon03",
        tooltipTitle: "Sell Tower",
        tooltipDescription: "Remove this tower and receive a gold refund.",
        tooltipCost: null,
        tooltipResource: "gold",
      }];
      if (options[0]) {
        const upgradeDescriptionA = `${getTowerDescription(tower?.type)} ${getTowerTooltipSummary(tower?.type)} Upgrade: ${options[0].label}.`;
        actionDefs.push({
          innerRow: 1,
          innerCol: 2,
          actionId: `upgrade:${options[0].id}`,
          label: `${options[0].label} (${options[0].cost}g)`,
          enabled: this.gameState.gold >= options[0].cost,
          tooltipTitle: options[0].label,
          tooltipDescription: upgradeDescriptionA,
          tooltipCost: options[0].cost,
          tooltipResource: "gold",
          tooltipWarning: this.gameState.gold >= options[0].cost ? "" : "Not enough gold",
        });
      }
      if (options[1]) {
        const upgradeDescriptionB = `${getTowerDescription(tower?.type)} ${getTowerTooltipSummary(tower?.type)} Upgrade: ${options[1].label}.`;
        actionDefs.push({
          innerRow: 1,
          innerCol: 3,
          actionId: `upgrade:${options[1].id}`,
          label: `${options[1].label} (${options[1].cost}g)`,
          enabled: this.gameState.gold >= options[1].cost,
          tooltipTitle: options[1].label,
          tooltipDescription: upgradeDescriptionB,
          tooltipCost: options[1].cost,
          tooltipResource: "gold",
          tooltipWarning: this.gameState.gold >= options[1].cost ? "" : "Not enough gold",
        });
      }
      actionDefs.push({
        innerRow: 3,
        innerCol: 4,
        actionId: "clearSelection",
        label: "",
        enabled: true,
        iconKey: "hammerIcon08",
        tooltipTitle: "Back",
        tooltipDescription: "Close this tower menu.",
        tooltipCost: null,
        tooltipResource: "gold",
      });
      this.hud.setActionSlots(this.buildHudActionSlots(actionDefs));
      return;
    }
    this.hud.setActionSlots([]);
  }

  handleHudAction(action) {
    if (action === "openCraftMenu") {
      this.setHudActionMode("barracksCraftMenu");
      return;
    }
    if (action === "craftTower") {
      if (this.gameState.gold < this.towerSystem.towerCost) {
        return;
      }
      this.startTowerPlacement({ preserveSelection: true, returnMode: "barracksCraftMenu" });
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
    if (action === "backFromCraft") {
      this.setHudActionMode("barracksMain");
      return;
    }
    if (action === "clearSelection") {
      this.selectedBuilding = null;
      this.clearTowerGroupSelection();
      this.setHudActionMode("empty");
      this.hud.render(this.gameState, this.towerSystem.towers.length, STARTING_LIVES, this.selectedBuilding, this.getWaveInfo());
      this.redrawSelectionOutline();
      return;
    }
    if (action === "sellTower" && this.selectedBuilding?.kind === "tower") {
      const refund = this.towerSystem.removeTowerAtCell(this.selectedBuilding.cellX, this.selectedBuilding.cellY);
      if (refund > 0) {
        this.gameState.gold += refund;
        this.selectedBuilding = null;
        this.clearTowerGroupSelection();
        this.setHudActionMode("empty");
        this.debugOverlay.redraw();
        this.hud.render(
          this.gameState,
          this.towerSystem.towers.length,
          STARTING_LIVES,
          this.selectedBuilding,
          this.getWaveInfo(),
        );
        this.redrawSelectionOutline();
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
    if (this.textures.exists("blueTower")) {
      this._towerGhost = this.add.image(pointer.worldX, pointer.worldY, "blueTower");
      this._towerGhost.setOrigin(0.5, 1);
      this._towerGhost.setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
      this._towerGhost.setDepth(19);
      this._towerGhost.setAlpha(0.6);
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
      this.selectedBuilding.label = getTowerDisplayName(tower.type);
      this.selectedBuilding.damage = tower.damage;
      this.selectedBuilding.range = tower.range;
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
    this.redrawSelectionOutline();
  }

  updateTowerGhost(pointer) {
    if (!this._pendingPlacement || !this._towerGhost) {
      return;
    }
    const cell = this.pointerToCell(pointer);
    if (!cell) {
      this._towerGhost.setVisible(false);
      return;
    }
    this._towerGhost.setVisible(true);
    const world = cellToWorld(cell.x, cell.y);
    this._towerGhost.setPosition(world.x, world.y + TILE_SIZE / 2);
  }

  getWaveInfo() {
    const role = this.waveSystem?.spawner?.waveRole;
    return {
      role: typeof role === "string" && role.length > 0 ? role : "unknown",
      wave: Number(this.gameState?.wave) || 1,
      enemiesAlive: this.enemySystem?.getActiveEnemies?.().length ?? 0,
    };
  }

  syncEnemyBarracksTargets() {
    this.enemySystem.syncFromMap(this.map);
    this.enemySystem.setBarracksTargets(this.map.points.enemyBarracks, this.map.points.homeBarracks);
    this.debugOverlay.redraw();
  }

  syncHudForEditorMode() {
    const editorEnabled = Boolean(this.editor?.enabled);
    this.hud?.setTopVisible(true);
    this.hud?.setBottomVisible(!editorEnabled);
    this._clampCameraScroll();
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
    cam.setScroll(Phaser.Math.Clamp(cam.scrollX, minSX, maxSX), Phaser.Math.Clamp(cam.scrollY, minSY, maxSY));
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

  bindInput() {
    this.input.on("pointerdown", (pointer) => {
      if (this._isPanPointer(pointer)) {
        const ev = /** @type {MouseEvent | undefined} */ (pointer.event);
        ev?.preventDefault();
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
      const margins = this.hud?.getOcclusionMargins?.() ?? { top: 0, bottom: 0, left: 0, right: 0 };
      const viewW = this.scale.width;
      const viewH = this.scale.height;
      const inTopHud = margins.top > 0 && pointer.y <= margins.top;
      const inBottomHud = margins.bottom > 0 && pointer.y >= viewH - margins.bottom;
      const inLeftHud = margins.left > 0 && pointer.x <= margins.left;
      const inRightHud = margins.right > 0 && pointer.x >= viewW - margins.right;
      if (inTopHud || inBottomHud || inLeftHud || inRightHud) {
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
          this.setHudActionMode("towerMenu");
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

      this.selectedBuilding = null;
      this.clearTowerGroupSelection();
      this.setHudActionMode("empty");
      this.hud.render(
        this.gameState,
        this.towerSystem.towers.length,
        STARTING_LIVES,
        this.selectedBuilding,
        this.getWaveInfo(),
      );
      this.redrawSelectionOutline();
    });

    this.input.on("pointermove", (pointer) => {
      if (this._cameraPanning && !this._isPanPointer(pointer)) {
        this._cameraPanning = false;
      }
      if (this._cameraPanning) {
        const cam = this.cameras.main;
        const dx = pointer.x - this._lastPanX;
        const dy = pointer.y - this._lastPanY;
        this._lastPanX = pointer.x;
        this._lastPanY = pointer.y;
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        this._clampCameraScroll();
        return;
      }
      this.updateTowerGhost(pointer);
      this.editor.handlePointerMove(pointer);
    });

    this.input.on("pointerup", (pointer) => {
      if (!this._isPanPointer(pointer)) {
        this._cameraPanning = false;
      }
      this.editor.handlePointerUp(pointer);
    });

    this.input.on("wheel", (pointer, _over, deltaX, deltaY) => {
      const cam = this.cameras.main;
      const e = /** @type {UIEvent & { shiftKey?: boolean } | undefined} */ (pointer.event);
      if (e?.shiftKey) {
        const k = 0.25 / cam.zoom;
        cam.scrollX += deltaX * k;
        cam.scrollY += deltaY * k;
        this._clampCameraScroll();
        return;
      }
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(oldZoom * (1 - deltaY * 0.001), CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
      if (Math.abs(newZoom - oldZoom) < 1e-6) {
        return;
      }
      const before = new Phaser.Math.Vector2();
      const after = new Phaser.Math.Vector2();
      cam.getWorldPoint(pointer.x, pointer.y, before);
      cam.setZoom(newZoom);
      cam.getWorldPoint(pointer.x, pointer.y, after);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
      this._clampCameraScroll();
    });

    this.input.keyboard.on("keydown-G", () => {
      this.debugOverlay.toggle();
    });

    this.input.keyboard.on("keydown-P", () => {
      if (this.editor.enabled) {
        return;
      }
      this.togglePause();
    });

    this.input.keyboard.on("keydown-R", () => {
      this.scene.restart();
    });
    this.input.keyboard.on("keydown-O", () => {
      this._adaptiveEnabled = !this._adaptiveEnabled;
    });

    this.input.keyboard.on("keydown-E", () => {
      this.toggleMapEditorFromMenu();
    });

    this._onGameplayKeyDown = (/** @type {KeyboardEvent} */ ev) => {
      const hud = this.hud;
      const store = this.keybindStore;
      if (!hud || !store) {
        return;
      }
      if (hud.isRebindingKey()) {
        return;
      }
      if (hud.isKeybindPanelOpen()) {
        if (ev.keyCode === store.getCode("backOrClose") || ev.key === "Escape") {
          hud.closeKeybindPanel();
          ev.preventDefault();
        }
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
  }

  createPauseOverlay() {
    this._pauseOverlayRoot?.destroy(true);
    this._pauseOverlayRoot = null;
    const width = this.scale.width;
    const height = this.scale.height;
    const backdrop = this.add.rectangle(0, 0, width, height, cozyTheme.colors.overlay, 0.65).setOrigin(0, 0);
    const panel = createCozyPanel(this, width * 0.5, height * 0.5, 460, 360);
    const title = this.add.text(width * 0.5, height * 0.5 - 120, "Paused", {
      fontFamily: "Georgia, serif",
      fontSize: "48px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);
    const resumeBtn = createCozyButton(this, "Resume", () => this.togglePause(), { width: 220, fontSize: 24 });
    const settingsBtn = createCozyButton(this, "Settings", () => this.openSettingsFromGame(), { width: 220, fontSize: 22 });
    const restartBtn = createCozyButton(this, "Restart", () => this.scene.restart(), { width: 220, fontSize: 22 });
    const menuBtn = createCozyButton(this, "Main Menu", () => this.backToMainMenu(), { width: 220, fontSize: 22 });
    resumeBtn.setPosition(width * 0.5, height * 0.5 - 35);
    settingsBtn.setPosition(width * 0.5, height * 0.5 + 20);
    restartBtn.setPosition(width * 0.5, height * 0.5 + 75);
    menuBtn.setPosition(width * 0.5, height * 0.5 + 130);
    this._pauseOverlayRoot = this.add.container(0, 0, [backdrop, panel, title, resumeBtn, settingsBtn, restartBtn, menuBtn]);
    this._pauseOverlayRoot.setDepth(180);
    this._pauseOverlayRoot.setVisible(false);
  }

  createRunEndOverlay() {
    this._runEndOverlayRoot?.destroy(true);
    this._runEndOverlayRoot = null;
    const width = this.scale.width;
    const height = this.scale.height;
    const backdrop = this.add.rectangle(0, 0, width, height, cozyTheme.colors.overlay, 0.72).setOrigin(0, 0);
    const panel = createCozyPanel(this, width * 0.5, height * 0.5, 620, 420);
    this._runEndTitle = this.add.text(width * 0.5, height * 0.5 - 140, "Run Complete", {
      fontFamily: "Georgia, serif",
      fontSize: "46px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);
    this._runEndStats = this.add.text(width * 0.5, height * 0.5 - 40, "", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    }).setOrigin(0.5, 0.5);
    const retryBtn = createCozyButton(this, "Retry", () => this.scene.restart(), { width: 220, fontSize: 24 });
    const menuBtn = createCozyButton(this, "Back to Menu", () => this.backToMainMenu(), { width: 220, fontSize: 24 });
    retryBtn.setPosition(width * 0.5 - 120, height * 0.5 + 120);
    menuBtn.setPosition(width * 0.5 + 120, height * 0.5 + 120);
    this._runEndOverlayRoot = this.add.container(0, 0, [backdrop, panel, this._runEndTitle, this._runEndStats, retryBtn, menuBtn]);
    this._runEndOverlayRoot.setDepth(185);
    this._runEndOverlayRoot.setVisible(false);
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
    if (this.hud?.isKeybindPanelOpen?.()) {
      this.hud.closeKeybindPanel();
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
    this.editor.toggle();
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
    if (this._hudActionMode === "barracksCraftMenu") {
      this.handleHudAction("backFromCraft");
      return;
    }
    if (this._pendingPlacement?.type === "tower") {
      const returnMode = this._placementReturnMode;
      this.clearTowerPlacement();
      this.setHudActionMode(returnMode ?? "empty");
      this.hud.render(
        this.gameState,
        this.towerSystem.towers.length,
        STARTING_LIVES,
        this.selectedBuilding,
        this.getWaveInfo(),
      );
      return;
    }
    if (this.selectedBuilding != null) {
      this.handleHudAction("clearSelection");
    }
  }

  redrawTerrain() {
    this.cameras.main.setBackgroundColor(this.map.bgColor);
    this.terrainContainer.removeAll(true);

    const layers = deriveLayers(this.map.elevation);
    const hasSheet = hasTinySwordsFolderHint(this);
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensurePathMaskGrid(this.map);
    const shoreKey = this.map.tilesets.shore;
    const plateauKey = this.map.tilesets.plateau;

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        if (layers.islandMask[y][x] !== 1) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (hasSheet) {
          const elev = this.map.elevation[y][x];
          const ov = resolvedTerrainOverride(this.map.tileOverrides[y][x]);
          const frame =
            elev < 2 && ov != null
              ? ov.frame
              : getShoreFrameIndex(layers.islandMask, x, y, this.map.width, this.map.height, shoreKey);
          const sheetKey = elev < 2 && ov != null && this.textures.exists(ov.sheet) ? ov.sheet : DEFAULT_TERRAIN_SHEET;
          const spr = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, sheetKey, frame ?? 0);
          this.terrainContainer.add(spr);
        } else {
          const fallback = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 0x7fa05f);
          fallback.setOrigin(0.5, 0.5);
          this.terrainContainer.add(fallback);
        }
      }
    }

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        if (layers.highGround[y][x] !== 1) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (hasSheet) {
          const elev = this.map.elevation[y][x];
          const ov = resolvedTerrainOverride(this.map.tileOverrides[y][x]);
          const frame =
            elev === 2 && ov != null
              ? ov.frame
              : getHighGroundFrameIndex(layers.highGround, x, y, this.map.width, this.map.height, plateauKey);
          const sheetKey = elev === 2 && ov != null && this.textures.exists(ov.sheet) ? ov.sheet : DEFAULT_TERRAIN_SHEET;
          const spr = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, sheetKey, frame ?? 0);
          spr.setAlpha(0.98);
          this.terrainContainer.add(spr);
        } else {
          const overlay = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE - 8, TILE_SIZE - 8, 0x8fb665, 0.55);
          overlay.setOrigin(0.5, 0.5);
          this.terrainContainer.add(overlay);
        }
      }
    }

    if (hasSheet) {
      for (let y = 0; y < this.map.height; y += 1) {
        for (let x = 0; x < this.map.width; x += 1) {
          const dec = this.map.decorations[y][x];
          if (dec == null || typeof dec !== "object" || typeof dec.sheet !== "string" || typeof dec.frame !== "number") {
            continue;
          }
          if (!this.textures.exists(dec.sheet)) {
            continue;
          }
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const spr = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, dec.sheet, dec.frame);
          spr.setDepth(12);
          this.terrainContainer.add(spr);
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

    const escaped = this.enemySystem.consumeEscapedCount();
    if (escaped > 0) {
      this.gameState.lives = Math.max(0, this.gameState.lives - escaped);
      this._performance.leaksInWave += escaped;
      if (this.gameState.lives <= 0) {
        this.endRun("defeat");
        return;
      }
    }

    if (this.gameState.wave !== this.waveSystem.waveIndex) {
      this._performance.clearedWaves += 1;
      const livesLostInWave = Math.max(0, this._performance.livesAtWaveStart - this.gameState.lives);
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
