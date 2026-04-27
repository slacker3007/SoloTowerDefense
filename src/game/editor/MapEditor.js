import { createFreshMap001 } from "../maps/map-001";
import { buildDefaultPathMask, pathMaskFromLegacyEnemyPath, tryParsePathMaskFromJson } from "../maps/enemyPath";
import {
  copyMapStateFrom,
  ensureMapOverrideGrids,
  ensureMapTilesets,
  ensurePathMaskGrid,
  syncBarracksPointsFromBuildings,
} from "../maps/mapUtils";
import { normalizeTerrainTileOverride, TERRAIN_TILE_SHEETS } from "../maps/tileOverrideSchema";

const MAP_JSON_VERSION = 1;
const DEFAULT_PICKER_SHEET = "terrainColor1";
const MAP_STORAGE_KEY = "solo-td:map-editor:map001";

export class MapEditor {
  /**
   * @param {*} scene Phaser scene with gameState, map, redrawTerrain, syncEnemyBarracksTargets, pointerToCell, hud
   * @param {*} map
   */
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensurePathMaskGrid(this.map);

    this.enabled = false;
    /** @type {"paint" | "moveBuilding" | "select" | "pathMask"} */
    this.tool = "paint";
    /** When true, path mask brush erases (sets 0). */
    this.pathMaskErase = false;
    /** @type {"elevation" | "stairs"} */
    this.paintKind = "elevation";
    /** @type {0 | 1 | 2} */
    this.paintElevation = 1;
    /** @type {{ x: number, y: number } | null} */
    this.movePickCell = null;
    /** @type {{ x: number, y: number } | null} */
    this.selectedCell = null;
    this.selectedCellKeys = new Set();
    /** @type {"terrain" | "decoration"} */
    this.pickerRole = "terrain";
    this.pickerSheet = DEFAULT_PICKER_SHEET;

    this.isDirty = false;
    this.lastSavedAt = null;

    this._pausedBeforeEditor = false;
    this._isPainting = false;

    /** @type {(() => void) | null} */
    this.onChange = null;
    /** @type {import("./EditorPanel.js").EditorPanel | null} */
    this._domPanel = null;

    /** @type {HTMLInputElement | null} */
    this._fileInput = typeof document !== "undefined" ? document.createElement("input") : null;
    if (this._fileInput) {
      this._fileInput.type = "file";
      this._fileInput.accept = "application/json,.json";
      this._fileInput.style.display = "none";
      document.body.appendChild(this._fileInput);
      this._fileInput.addEventListener("change", () => this._onImportFileSelected());
    }

    this._boundKeyDown = (event) => this._onKeyDown(event);
    scene.input.keyboard?.on("keydown", this._boundKeyDown);

    this._loadMapFromStorage();
  }

  _cellKey(x, y) {
    return `${x},${y}`;
  }

  _markDirty() {
    this.isDirty = true;
    this._notifyChange();
  }

  _markSaved() {
    this.isDirty = false;
    this.lastSavedAt = new Date();
    this._notifyChange();
  }

  getSelectedCells() {
    const cells = [];
    for (const key of this.selectedCellKeys) {
      const [x, y] = key.split(",").map((v) => Number(v));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        cells.push({ x, y });
      }
    }
    return cells;
  }

  getSelectedCount() {
    return this.selectedCellKeys.size;
  }

  /**
   * @param {import("./EditorPanel.js").EditorPanel} panel
   */
  bindDomPanel(panel) {
    this._domPanel = panel;
    this.onChange = () => {
      panel.refresh();
    };
  }

  /** @param {import("./EditorPanel.js").EditorPanel} panel */
  unbindDomPanel(panel) {
    if (this._domPanel === panel) {
      this._domPanel = null;
      this.onChange = null;
    }
  }

  _notifyChange() {
    this.onChange?.();
  }

  destroy() {
    this.scene.input.keyboard?.off("keydown", this._boundKeyDown);
    this._fileInput?.remove();
  }

  setEnabled(value) {
    if (this.enabled === value) {
      return;
    }
    this.enabled = value;
    const gs = this.scene.gameState;
    if (value) {
      this._pausedBeforeEditor = gs.paused;
      gs.paused = true;
    } else {
      gs.paused = this._pausedBeforeEditor;
    }
    this._domPanel?.setVisible(value);
    this._notifyChange();
    this.scene.hud?.render(gs);
    this.scene.redrawTerrain();
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  setTool(tool) {
    this.tool = tool;
    if (tool === "moveBuilding") {
      this.movePickCell = null;
    }
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setElevationBrush(level) {
    this.tool = "paint";
    this.paintKind = "elevation";
    this.paintElevation = /** @type {0|1|2} */ (level);
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setStairsBrush() {
    this.tool = "paint";
    this.paintKind = "stairs";
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setMoveBuildingTool() {
    this.tool = "moveBuilding";
    this.movePickCell = null;
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setSelectTool() {
    this.tool = "select";
    this.movePickCell = null;
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setPathMaskBrush() {
    this.tool = "pathMask";
    this.movePickCell = null;
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  /**
   * @param {boolean} erase If true, brush removes path; if false, brush paints path.
   */
  setPathMaskErase(erase) {
    this.pathMaskErase = Boolean(erase);
    this._notifyChange();
  }

  /**
   * @param {boolean} value 1 = path, 0 = not path
   */
  setPathMaskOnSelected(value) {
    if (this.getSelectedCount() === 0) {
      return;
    }
    ensurePathMaskGrid(this.map);
    for (const { x, y } of this.getSelectedCells()) {
      this.map.pathMask[y][x] = value ? 1 : 0;
    }
    this.scene.redrawTerrain();
    this._markDirty();
    this.scene.syncEnemyBarracksTargets();
    this._notifyChange();
  }

  /**
   * @param {"terrain" | "decoration"} role
   */
  setPickerRole(role) {
    this.pickerRole = role;
    this._notifyChange();
  }

  /**
   * @param {string} sheetKey terrainColor1 … terrainColor5
   */
  setPickerSheet(sheetKey) {
    if (!TERRAIN_TILE_SHEETS.includes(sheetKey)) {
      return;
    }
    this.pickerSheet = sheetKey;
    this._notifyChange();
  }

  clearSelection() {
    this.selectedCell = null;
    this.selectedCellKeys.clear();
    this.scene.redrawTerrain();
    this._notifyChange();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{ additive?: boolean }} [opts]
   */
  selectCell(x, y, opts = {}) {
    const additive = Boolean(opts.additive);
    const key = this._cellKey(x, y);

    if (!additive) {
      this.selectedCellKeys.clear();
      this.selectedCellKeys.add(key);
      this.selectedCell = { x, y };
    } else {
      this.selectedCellKeys.add(key);
      this.selectedCell = { x, y };
    }

    this.scene.redrawTerrain();
    this._notifyChange();
  }

  /**
   * @param {number} frame
   */
  applyPickedTileFrame(frame) {
    if (this.getSelectedCount() === 0 || !Number.isFinite(frame)) {
      return;
    }
    ensureMapOverrideGrids(this.map);

    for (const { x, y } of this.getSelectedCells()) {
      if (this.pickerRole === "terrain") {
        this.map.tileOverrides[y][x] = { sheet: this.pickerSheet, frame };
      } else {
        this.map.decorations[y][x] = { sheet: this.pickerSheet, frame };
      }
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  clearTerrainOverride() {
    if (this.getSelectedCount() === 0) {
      return;
    }
    ensureMapOverrideGrids(this.map);

    for (const { x, y } of this.getSelectedCells()) {
      this.map.tileOverrides[y][x] = null;
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  clearDecoration() {
    if (this.getSelectedCount() === 0) {
      return;
    }
    ensureMapOverrideGrids(this.map);

    for (const { x, y } of this.getSelectedCells()) {
      this.map.decorations[y][x] = null;
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  /**
   * @param {"shore" | "plateau"} layer
   * @param {string} key
   */
  setTilesetPreset(layer, key) {
    ensureMapTilesets(this.map);
    if (layer === "shore") {
      this.map.tilesets.shore = key;
    } else {
      this.map.tilesets.plateau = key;
    }
    this.scene.redrawTerrain();
    this._markDirty();
  }

  resetToDefault() {
    const fresh = createFreshMap001();
    copyMapStateFrom(this.map, fresh);
    syncBarracksPointsFromBuildings(this.map);
    this.selectedCell = null;
    this.selectedCellKeys.clear();
    this.scene.redrawTerrain();
    this.scene.syncEnemyBarracksTargets();
    this._markDirty();
  }

  triggerImportFilePicker() {
    this._fileInput?.click();
  }

  saveMap() {
    this._saveMapToStorage();
  }

  _saveMapToStorage() {
    try {
      const payload = this._buildSerializableMapPayload();
      localStorage.setItem(
        MAP_STORAGE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          map: payload,
        }),
      );
      this._markSaved();
    } catch (err) {
      console.warn("Failed to save map to local storage", err);
    }
  }

  _loadMapFromStorage() {
    try {
      const raw = localStorage.getItem(MAP_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.map) {
        return;
      }
      const ok = this.importMapData(parsed.map);
      if (!ok) {
        return;
      }
      this.isDirty = false;
      this.lastSavedAt =
        typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
          ? new Date(parsed.savedAt)
          : new Date();
    } catch (err) {
      console.warn("Failed to load saved map from local storage", err);
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (event.key === "e" || event.key === "E") {
      return;
    }

    if (!this.enabled) {
      return;
    }

    if (event.ctrlKey && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      this.saveMap();
      return;
    }

    if (event.ctrlKey && (event.key === "o" || event.key === "O")) {
      event.preventDefault();
      this._fileInput?.click();
      return;
    }

    if (event.key === "1") {
      this.setElevationBrush(0);
    } else if (event.key === "2") {
      this.setElevationBrush(1);
    } else if (event.key === "3") {
      this.setElevationBrush(2);
    } else if (event.key === "4") {
      this.setStairsBrush();
    } else if (event.key === "5") {
      this.setMoveBuildingTool();
    } else if (event.key === "6") {
      this.setSelectTool();
    } else if (event.key === "7") {
      this.setPathMaskBrush();
    }
  }

  _onImportFileSelected() {
    const input = this._fileInput;
    if (!input?.files?.length) {
      return;
    }
    const file = input.files[0];
    input.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (this.importMapData(data)) {
          syncBarracksPointsFromBuildings(this.map);
          this.scene.redrawTerrain();
          this.scene.syncEnemyBarracksTargets();
          this._markDirty();
        }
      } catch (err) {
        console.warn("Map import failed", err);
      }
    };
    reader.readAsText(file);
  }

  /**
   * @param {unknown} data
   * @returns {boolean}
   */
  importMapData(data) {
    if (!data || typeof data !== "object") {
      return false;
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.version !== MAP_JSON_VERSION) {
      console.warn("Unsupported map JSON version");
      return false;
    }
    if (d.width !== this.map.width || d.height !== this.map.height) {
      console.warn("Map size mismatch");
      return false;
    }
    if (!Array.isArray(d.elevation) || !Array.isArray(d.stairs) || !Array.isArray(d.buildings)) {
      return false;
    }
    if (d.elevation.length !== this.map.height || d.stairs.length !== this.map.height || d.buildings.length !== this.map.height) {
      return false;
    }

    for (let y = 0; y < this.map.height; y += 1) {
      const rowE = /** @type {unknown[]} */ (d.elevation[y]);
      const rowS = /** @type {unknown[]} */ (d.stairs[y]);
      const rowB = /** @type {unknown[]} */ (d.buildings[y]);
      if (!Array.isArray(rowE) || rowE.length !== this.map.width) {
        return false;
      }
      if (!Array.isArray(rowS) || rowS.length !== this.map.width) {
        return false;
      }
      if (!Array.isArray(rowB) || rowB.length !== this.map.width) {
        return false;
      }
    }

    this.map.id = typeof d.id === "string" ? d.id : this.map.id;
    this.map.bgColor = typeof d.bgColor === "number" ? d.bgColor : this.map.bgColor;

    const ts = d.tilesets;
    if (ts && typeof ts === "object") {
      const t = /** @type {Record<string, unknown>} */ (ts);
      ensureMapTilesets(this.map);
      if (typeof t.shore === "string") {
        this.map.tilesets.shore = t.shore;
      }
      if (typeof t.plateau === "string") {
        this.map.tilesets.plateau = t.plateau;
      }
    } else {
      ensureMapTilesets(this.map);
    }

    const pts = d.points;
    if (pts && typeof pts === "object") {
      const p = /** @type {Record<string, unknown>} */ (pts);
      if (p.homeBarracks && typeof p.homeBarracks === "object") {
        const h = /** @type {{ x?: unknown, y?: unknown }} */ (p.homeBarracks);
        if (typeof h.x === "number" && typeof h.y === "number") {
          this.map.points.homeBarracks = { x: h.x, y: h.y };
        }
      }
      if (p.enemyBarracks && typeof p.enemyBarracks === "object") {
        const e = /** @type {{ x?: unknown, y?: unknown }} */ (p.enemyBarracks);
        if (typeof e.x === "number" && typeof e.y === "number") {
          this.map.points.enemyBarracks = { x: e.x, y: e.y };
        }
      }
    }

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const rowE = /** @type {number[][]} */ (d.elevation)[y];
        const rowS = /** @type {number[][]} */ (d.stairs)[y];
        const rowB = /** @type {(string|null)[][]} */ (d.buildings)[y];
        if (!Array.isArray(rowE) || !Array.isArray(rowS) || !Array.isArray(rowB)) {
          return false;
        }
        const ev = rowE[x];
        const st = rowS[x];
        const bd = rowB[x];
        if (typeof ev !== "number" || ev < 0 || ev > 2) {
          return false;
        }
        this.map.elevation[y][x] = ev;
        this.map.stairs[y][x] = st === 1 ? 1 : 0;
        this.map.buildings[y][x] = typeof bd === "string" ? bd : null;
      }
    }

    ensureMapOverrideGrids(this.map);
    const rowTO = d.tileOverrides;
    const rowDec = d.decorations;
    if (Array.isArray(rowTO) && rowTO.length === this.map.height) {
      for (let y = 0; y < this.map.height; y += 1) {
        const row = rowTO[y];
        if (!Array.isArray(row) || row.length !== this.map.width) {
          return false;
        }
        for (let x = 0; x < this.map.width; x += 1) {
          const v = row[x];
          this.map.tileOverrides[y][x] = normalizeTerrainTileOverride(v);
        }
      }
    } else {
      for (let y = 0; y < this.map.height; y += 1) {
        for (let x = 0; x < this.map.width; x += 1) {
          this.map.tileOverrides[y][x] = null;
        }
      }
    }
    if (Array.isArray(rowDec) && rowDec.length === this.map.height) {
      for (let y = 0; y < this.map.height; y += 1) {
        const row = rowDec[y];
        if (!Array.isArray(row) || row.length !== this.map.width) {
          return false;
        }
        for (let x = 0; x < this.map.width; x += 1) {
          const v = row[x];
          if (v != null && typeof v === "object" && typeof v.sheet === "string" && typeof v.frame === "number") {
            this.map.decorations[y][x] = { sheet: v.sheet, frame: v.frame };
          } else {
            this.map.decorations[y][x] = null;
          }
        }
      }
    } else {
      for (let y = 0; y < this.map.height; y += 1) {
        for (let x = 0; x < this.map.width; x += 1) {
          this.map.decorations[y][x] = null;
        }
      }
    }

    syncBarracksPointsFromBuildings(this.map);
    ensureMapTilesets(this.map);
    this._importPathMaskFromData(d);
    this.selectedCell = null;
    this.selectedCellKeys.clear();
    this.scene.redrawTerrain();
    return true;
  }

  /**
   * @param {Record<string, unknown>} d
   */
  _importPathMaskFromData(d) {
    const s = this.map.points.enemyBarracks;
    const t = this.map.points.homeBarracks;
    const w = this.map.width;
    const h = this.map.height;
    const parsed = tryParsePathMaskFromJson(d.pathMask, w, h);
    if (parsed) {
      this.map.pathMask = parsed;
    } else if (d.enemyPath != null) {
      const leg = pathMaskFromLegacyEnemyPath(
        d.enemyPath,
        w,
        h,
        s,
        t,
      );
      if (leg) {
        this.map.pathMask = leg;
      } else {
        this.map.pathMask = buildDefaultPathMask(s, t, w, h);
      }
    } else {
      this.map.pathMask = buildDefaultPathMask(s, t, w, h);
    }
    ensurePathMaskGrid(this.map);
  }

  exportJson() {
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensurePathMaskGrid(this.map);
    const payload = this._buildSerializableMapPayload();

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.map.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _buildSerializableMapPayload() {
    ensurePathMaskGrid(this.map);
    return {
      id: this.map.id,
      version: MAP_JSON_VERSION,
      width: this.map.width,
      height: this.map.height,
      bgColor: this.map.bgColor,
      points: {
        homeBarracks: { ...this.map.points.homeBarracks },
        enemyBarracks: { ...this.map.points.enemyBarracks },
      },
      tilesets: {
        shore: this.map.tilesets.shore,
        plateau: this.map.tilesets.plateau,
      },
      elevation: this.map.elevation.map((row) => [...row]),
      stairs: this.map.stairs.map((row) => [...row]),
      buildings: this.map.buildings.map((row) => [...row]),
      tileOverrides: this.map.tileOverrides.map((row) => row.map((cell) => normalizeTerrainTileOverride(cell))),
      decorations: this.map.decorations.map((row) =>
        row.map((cell) => (cell && typeof cell === "object" ? { sheet: cell.sheet, frame: cell.frame } : null)),
      ),
      pathMask: this.map.pathMask.map((row) => [...row]),
    };
  }

  /**
   * @param {import("phaser").Input.Pointer} pointer
   * @returns {boolean} true if editor consumed the event
   */
  handlePointerDown(pointer) {
    if (!this.enabled || !pointer.leftButtonDown()) {
      return false;
    }

    const cell = this.scene.pointerToCell(pointer);
    if (!cell) {
      return true;
    }

    if (this.tool === "select") {
      const shift = Boolean(pointer.event?.shiftKey);
      this.selectCell(cell.x, cell.y, { additive: shift });
      return true;
    }

    if (this.tool === "moveBuilding") {
      this._handleMoveBuildingClick(cell.x, cell.y);
      return true;
    }

    if (this.tool === "pathMask") {
      this._isPainting = true;
      this._applyPathMaskAt(cell.x, cell.y, pointer);
      return true;
    }

    this._isPainting = true;
    this._applyPaintAt(cell.x, cell.y);
    return true;
  }

  /**
   * @param {import("phaser").Input.Pointer} pointer
   * @returns {boolean}
   */
  handlePointerMove(pointer) {
    if (!this.enabled) {
      return false;
    }
    if (this._isPainting && this.tool === "pathMask" && pointer.leftButtonDown()) {
      const cell = this.scene.pointerToCell(pointer);
      if (cell) {
        this._applyPathMaskAt(cell.x, cell.y, pointer);
      }
      return true;
    }
    if (!this._isPainting || this.tool !== "paint") {
      return false;
    }
    if (!pointer.leftButtonDown()) {
      return false;
    }
    const cell = this.scene.pointerToCell(pointer);
    if (!cell) {
      return true;
    }
    this._applyPaintAt(cell.x, cell.y);
    return true;
  }

  /**
   * @param {import("phaser").Input.Pointer} pointer
   * @returns {boolean}
   */
  handlePointerUp(_pointer) {
    if (!this.enabled) {
      return false;
    }
    this._isPainting = false;
    return false;
  }

  _applyPaintAt(x, y) {
    ensureMapOverrideGrids(this.map);
    if (this.paintKind === "stairs") {
      if (this.map.elevation[y][x] < 1) {
        return;
      }
      this.map.stairs[y][x] = this.map.stairs[y][x] === 1 ? 0 : 1;
    } else {
      if (this.map.buildings[y][x] != null) {
        return;
      }
      this.map.elevation[y][x] = this.paintElevation;
      if (this.map.elevation[y][x] === 0) {
        this.map.stairs[y][x] = 0;
      }
      this.map.tileOverrides[y][x] = null;
      this.map.decorations[y][x] = null;
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {import("phaser").Input.Pointer} [pointer]
   */
  _applyPathMaskAt(x, y, pointer) {
    ensurePathMaskGrid(this.map);
    const ev = /** @type {MouseEvent & { shiftKey?: boolean } | undefined} */ (pointer?.event);
    const erase = this.pathMaskErase || Boolean(ev?.shiftKey);
    this.map.pathMask[y][x] = erase ? 0 : 1;
    this.scene.redrawTerrain();
    this._markDirty();
    this.scene.syncEnemyBarracksTargets();
  }

  _handleMoveBuildingClick(x, y) {
    const b = this.map.buildings[y][x];

    if (this.movePickCell == null) {
      if (b == null) {
        return;
      }
      this.movePickCell = { x, y };
      this._notifyChange();
      return;
    }

    const from = this.movePickCell;
    const moving = this.map.buildings[from.y][from.x];
    if (moving == null) {
      this.movePickCell = null;
      this._notifyChange();
      return;
    }

    if (x === from.x && y === from.y) {
      this.movePickCell = null;
      this._notifyChange();
      return;
    }

    if (this.map.buildings[y][x] != null) {
      return;
    }

    if (this.map.elevation[y][x] < 1 || this.map.stairs[y][x] === 1) {
      return;
    }

    this.map.buildings[from.y][from.x] = null;
    this.map.buildings[y][x] = moving;
    this.movePickCell = null;
    syncBarracksPointsFromBuildings(this.map);
    this.scene.redrawTerrain();
    this.scene.syncEnemyBarracksTargets();
    this._markDirty();
  }
}
