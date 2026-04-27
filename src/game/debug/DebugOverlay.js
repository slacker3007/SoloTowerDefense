import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "../constants";
import { cellToWorld } from "../maps/tileRules";

export class DebugOverlay {
  constructor(scene, pathCells) {
    this.scene = scene;
    this.pathCells = pathCells;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(90);
    this.enabled = false;
  }

  setEnabled(value) {
    this.enabled = value;
    this.redraw();
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  redraw() {
    this.graphics.clear();
    if (!this.enabled) {
      return;
    }

    this.graphics.lineStyle(1, 0xffffff, 0.25);
    for (let x = 0; x <= GRID_COLS; x += 1) {
      this.graphics.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, GRID_ROWS * TILE_SIZE);
    }
    for (let y = 0; y <= GRID_ROWS; y += 1) {
      this.graphics.lineBetween(0, y * TILE_SIZE, GRID_COLS * TILE_SIZE, y * TILE_SIZE);
    }

    this.graphics.lineStyle(4, 0xf5d742, 0.9);
    for (let i = 0; i < this.pathCells.length - 1; i += 1) {
      const a = cellToWorld(this.pathCells[i].x, this.pathCells[i].y);
      const b = cellToWorld(this.pathCells[i + 1].x, this.pathCells[i + 1].y);
      this.graphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}
