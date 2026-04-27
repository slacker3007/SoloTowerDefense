import Phaser from "phaser";
import { STARTING_GOLD, STARTING_LIVES, TILE_SIZE } from "../game/constants";
import { createTinySwordsAnimations, hasTinySwordsFolderHint } from "../game/assets";
import { map001 } from "../game/maps/map-001";
import { path001 } from "../game/maps/path-001";
import { deriveLayers } from "../game/maps/elevation";
import {
  cellToWorld,
  getHighGroundFrameIndex,
  getShoreFrameIndex,
  isInsideGrid,
  worldToCell,
} from "../game/maps/tileRules";
import { EnemySystem } from "../game/systems/EnemySystem";
import { TowerSystem } from "../game/systems/TowerSystem";
import { CombatSystem } from "../game/systems/CombatSystem";
import { WaveSystem } from "../game/systems/WaveSystem";
import { Hud } from "../game/ui/Hud";
import { DebugOverlay } from "../game/debug/DebugOverlay";
import { balance } from "../game/balance";
import { MapEditor } from "../game/editor/MapEditor";
import { EditorPanel } from "../game/editor/EditorPanel";
import { ensureMapOverrideGrids, ensureMapTilesets } from "../game/maps/mapUtils";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  create() {
    this.map = map001;
    this.gameState = {
      gold: STARTING_GOLD,
      lives: STARTING_LIVES,
      wave: 0,
      paused: false,
    };

    createTinySwordsAnimations(this);

    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    this.editor = new MapEditor(this, this.map);
    this.editorPanel = new EditorPanel(this.editor);

    this.terrainContainer = this.add.container(0, 0);
    this.redrawTerrain();

    this.enemySystem = new EnemySystem(this, {
      map: this.map,
      pathCells: path001,
      spawnCell: this.map.points.enemyBarracks,
      targetCell: this.map.points.homeBarracks,
      moveMode: "pathfinding",
    });
    this.towerSystem = new TowerSystem(this, this.map);
    this.combatSystem = new CombatSystem(this, this.towerSystem, this.enemySystem);
    this.waveSystem = new WaveSystem(this.enemySystem);
    this.hud = new Hud(this);
    this.debugOverlay = new DebugOverlay(this, path001);
    this.debugOverlay.redraw();

    this.waveSystem.startAutoSpawner(balance.redBarracksSpawner);
    this.gameState.wave = this.waveSystem.waveIndex;

    this.bindInput();
    this.hud.render(this.gameState);
  }

  shutdown() {
    this.editorPanel?.destroy();
    this.editor.destroy();
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

  syncEnemyBarracksTargets() {
    this.enemySystem.setBarracksTargets(this.map.points.enemyBarracks, this.map.points.homeBarracks);
  }

  bindInput() {
    this.input.on("pointerdown", (pointer) => {
      if (this.editor.handlePointerDown(pointer)) {
        return;
      }
      if (this.gameState.paused) {
        return;
      }
      const cell = worldToCell(pointer.worldX, pointer.worldY);
      const placed = this.towerSystem.tryPlaceTower(cell.x, cell.y, this.gameState);
      if (placed) {
        this.hud.render(this.gameState);
      }
    });

    this.input.on("pointermove", (pointer) => {
      this.editor.handlePointerMove(pointer);
    });

    this.input.on("pointerup", (pointer) => {
      this.editor.handlePointerUp(pointer);
    });

    this.input.keyboard.on("keydown-G", () => {
      this.debugOverlay.toggle();
    });

    this.input.keyboard.on("keydown-P", () => {
      if (this.editor.enabled) {
        return;
      }
      this.gameState.paused = !this.gameState.paused;
      this.hud.render(this.gameState);
    });

    this.input.keyboard.on("keydown-R", () => {
      this.scene.restart();
    });

    this.input.keyboard.on("keydown-E", () => {
      this.editor.toggle();
    });
  }

  redrawTerrain() {
    this.cameras.main.setBackgroundColor(this.map.bgColor);
    this.terrainContainer.removeAll(true);

    const layers = deriveLayers(this.map.elevation);
    const hasSheet = hasTinySwordsFolderHint(this);
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    const shoreKey = this.map.tilesets.shore;
    const plateauKey = this.map.tilesets.plateau;

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (hasSheet) {
          const img = this.add.image(px + TILE_SIZE / 2, py + TILE_SIZE / 2, "waterBackground");
          this.terrainContainer.add(img);
        } else {
          const fallback = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 0x2d4f7d);
          fallback.setOrigin(0.5, 0.5);
          this.terrainContainer.add(fallback);
        }
      }
    }

    if (hasSheet && this.textures.exists("waterFoamSheet") && this.anims.exists("water-foam-loop")) {
      for (let y = 0; y < this.map.height; y += 1) {
        for (let x = 0; x < this.map.width; x += 1) {
          if (layers.waterFoam[y][x] !== 1) {
            continue;
          }
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const foam = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, "waterFoamSheet", 0);
          foam.play("water-foam-loop");
          this.terrainContainer.add(foam);
        }
      }
    }

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        if (layers.islandMask[y][x] !== 1) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (hasSheet) {
          const elev = this.map.elevation[y][x];
          const ov = this.map.tileOverrides[y][x];
          const frame =
            elev < 2 && ov != null && typeof ov === "number"
              ? ov
              : getShoreFrameIndex(layers.islandMask, x, y, this.map.width, this.map.height, shoreKey);
          const spr = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, "terrainColor1", frame ?? 0);
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
          const ov = this.map.tileOverrides[y][x];
          const frame =
            elev === 2 && ov != null && typeof ov === "number"
              ? ov
              : getHighGroundFrameIndex(layers.highGround, x, y, this.map.width, this.map.height, plateauKey);
          const spr = this.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, "terrainColor1", frame ?? 0);
          spr.setAlpha(0.98);
          this.terrainContainer.add(spr);
        } else {
          const overlay = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE - 8, TILE_SIZE - 8, 0x8fb665, 0.55);
          overlay.setOrigin(0.5, 0.5);
          this.terrainContainer.add(overlay);
        }
      }
    }

    const stairsGfx = this.add.graphics();
    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        if (this.map.stairs[y][x] !== 1) {
          continue;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        stairsGfx.fillStyle(0xb69463, 0.95);
        stairsGfx.fillRect(px + 12, py + 6, TILE_SIZE - 24, TILE_SIZE - 12);
        stairsGfx.lineStyle(1, 0x7a5a31, 0.8);
        for (let step = 14; step <= TILE_SIZE - 10; step += 10) {
          stairsGfx.lineBetween(px + 14, py + step, px + TILE_SIZE - 14, py + step);
        }
      }
    }
    this.terrainContainer.add(stairsGfx);

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
  }

  update(_time, delta) {
    if (this.gameState.paused) {
      return;
    }

    const deltaSeconds = delta / 1000;
    this.enemySystem.update(deltaSeconds);
    this.waveSystem.update(deltaSeconds);
    this.towerSystem.updateCooldowns(deltaSeconds);
    this.combatSystem.update(deltaSeconds, this.gameState);

    const escaped = this.enemySystem.consumeEscapedCount();
    if (escaped > 0) {
      this.gameState.lives = Math.max(0, this.gameState.lives - escaped);
    }

    this.gameState.wave = this.waveSystem.waveIndex;
    this.hud.render(this.gameState);
  }
}
