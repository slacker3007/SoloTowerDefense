import { createFreshMap001 } from "../maps/map-001";
import { buildDefaultPathMask, pathMaskFromLegacyEnemyPath, tryParsePathMaskFromJson } from "../maps/enemyPath";
import {
  copyMapStateFrom,
  ensureMapLayerTiles,
  ensureMapOverrideGrids,
  ensureMapTilesets,
  ensurePathMaskGrid,
  recomputeCellElevationFromLayerTiles,
  syncBarracksPointsFromBuildings,
} from "../maps/mapUtils";
import {
  cloneLayerTile,
  DEFAULT_TERRAIN_SHEET,
  getTerrainTileSheet,
  MAP_TILE_LAYER_COUNT,
  normalizeLayerTile,
} from "../maps/tileOverrideSchema";

const MAP_JSON_VERSION = 1;
const MAP_STORAGE_KEY = "solo-td:map-editor:map001";

export class MapEditor {
  /**
   * @param {*} scene Phaser scene with gameState, map, redrawTerrain, syncEnemyBarracksTargets, pointerToCell, hud
   * @param {*} map
   * @param {{ hydrateFromStorage?: boolean }} [options]
   */
  constructor(scene, map, options = {}) {
    this.scene = scene;
    this.map = map;
    ensureMapTilesets(this.map);
    ensureMapOverrideGrids(this.map);
    ensureMapLayerTiles(this.map);
    ensurePathMaskGrid(this.map);

    this.enabled = false;
    /** @type {"map" | "objects"} */
    this.editorMode = "map";
    /** @type {0 | 1 | 2 | 3} */
    this.activeLayer = 0;
    /** @type {"brush" | "moveBuilding" | "select" | "pathMask" | "placeBuilding"} */
    this.tool = "brush";
    /** When true, path mask brush erases (sets 0). */
    this.pathMaskErase = false;
    /** When true, map brush erases the active layer on the cell. */
    this.brushEraser = false;
    /** Selected tile frame for the active layer brush. */
    this.pickerFrame = 0;
    /** Building key for place-building tool (`barracks_blue`, `barracks_red`, etc.). */
    this.placeBuildingType = "barracks_blue";
    /** @type {{ x: number, y: number } | null} */
    this.movePickCell = null;
    /** @type {string} */
    this.moveStatus = "";
    /** @type {{ x: number, y: number } | null} */
    this.selectedCell = null;
    this.selectedCellKeys = new Set();
    this.pickerSheet = DEFAULT_TERRAIN_SHEET;

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

    this._hydrateFromStorage = Boolean(options.hydrateFromStorage);
    this._didHydrateFromStorage = false;
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

  getMovePickCell() {
    return this.movePickCell ? { ...this.movePickCell } : null;
  }

  getMoveStatus() {
    return this.moveStatus;
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
      if (this._hydrateFromStorage && !this._didHydrateFromStorage) {
        this._didHydrateFromStorage = true;
        this._loadMapFromStorage();
      }
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

  /**
   * @param {"map" | "objects"} mode
   */
  setEditorMode(mode) {
    this.editorMode = mode;
    if (mode === "map") {
      this.tool = "brush";
      this.movePickCell = null;
      this.moveStatus = "";
    } else {
      this.tool = "placeBuilding";
      this.movePickCell = null;
      this.moveStatus = "Place: drag to stamp building";
    }
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setActiveLayer(layer) {
    const nextLayer = Number(layer);
    if (!Number.isInteger(nextLayer) || nextLayer < 0 || nextLayer >= MAP_TILE_LAYER_COUNT) {
      return;
    }
    this.activeLayer = /** @type {0 | 1 | 2 | 3} */ (nextLayer);
    this.tool = "brush";
    this.editorMode = "map";
    this._notifyChange();
  }

  setBrushEraser(erase) {
    this.brushEraser = Boolean(erase);
    this._notifyChange();
  }

  /**
   * @param {number} frame
   */
  setBrushTileFrame(frame) {
    if (!Number.isFinite(frame)) {
      return;
    }
    const nextFrame = Math.floor(frame);
    const sheet = getTerrainTileSheet(this.pickerSheet);
    if (nextFrame < 0 || (sheet && nextFrame >= sheet.frameCount)) {
      return;
    }
    this.pickerFrame = nextFrame;
    this.tool = "brush";
    this.editorMode = "map";
    this._notifyChange();
  }

  /**
   * @param {string} buildingType
   */
  setPlaceBuildingType(buildingType) {
    this.placeBuildingType = buildingType;
    this.tool = "placeBuilding";
    this.editorMode = "objects";
    this.movePickCell = null;
    this.moveStatus = `Place: ${buildingType}`;
    this._notifyChange();
  }

  setTool(tool) {
    this.tool = tool;
    if (tool === "moveBuilding") {
      this.editorMode = "objects";
      this.movePickCell = null;
      this.moveStatus = "Move: click a barracks";
    } else if (tool === "placeBuilding") {
      this.editorMode = "objects";
      this.moveStatus = `Place: ${this.placeBuildingType}`;
    } else if (tool === "pathMask") {
      this.editorMode = "objects";
      this.moveStatus = "";
    } else if (tool === "select") {
      this.moveStatus = "Select: click cells (Shift to add)";
    } else {
      this.moveStatus = "";
    }
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setMoveBuildingTool() {
    this.tool = "moveBuilding";
    this.movePickCell = null;
    this.moveStatus = "Move: click a barracks";
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setSelectTool() {
    this.tool = "select";
    this.movePickCell = null;
    this.moveStatus = "Select: click cells (Shift to add)";
    this._notifyChange();
    this.scene.redrawTerrain();
  }

  setPathMaskBrush() {
    this.tool = "pathMask";
    this.movePickCell = null;
    this.moveStatus = "";
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
   * @param {string} sheetKey terrain tilemap key
   */
  setPickerSheet(sheetKey) {
    const sheet = getTerrainTileSheet(sheetKey);
    if (!sheet) {
      return;
    }
    this.pickerSheet = sheet.key;
    if (this.pickerFrame >= sheet.frameCount) {
      this.pickerFrame = 0;
    }
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
    if (!Number.isFinite(frame)) {
      return;
    }
    const nextFrame = Math.floor(frame);
    const sheet = getTerrainTileSheet(this.pickerSheet);
    if (!sheet || nextFrame < 0 || nextFrame >= sheet.frameCount) {
      return;
    }
    this.setBrushTileFrame(nextFrame);
    if (this.getSelectedCount() === 0) {
      return;
    }
    ensureMapLayerTiles(this.map);

    for (const { x, y } of this.getSelectedCells()) {
      this._setLayerTileAt(x, y, { sheet: this.pickerSheet, frame: nextFrame });
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  clearActiveLayer() {
    if (this.getSelectedCount() === 0) {
      return;
    }
    ensureMapLayerTiles(this.map);

    for (const { x, y } of this.getSelectedCells()) {
      this._setLayerTileAt(x, y, null);
    }

    this.scene.redrawTerrain();
    this._markDirty();
  }

  clearTerrainOverride() {
    this.clearActiveLayer();
  }

  clearDecoration() {
    this.clearActiveLayer();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {{ sheet: string, frame: number } | null} tile
   */
  _setLayerTileAt(x, y, tile) {
    ensureMapLayerTiles(this.map);
    ensureMapOverrideGrids(this.map);
    const layer = this.activeLayer;
    this.map.layerTiles[layer][y][x] = cloneLayerTile(normalizeLayerTile(tile));
    if (tile == null) {
      recomputeCellElevationFromLayerTiles(this.map, x, y);
    } else {
      for (let higher = layer + 1; higher < MAP_TILE_LAYER_COUNT; higher += 1) {
        this.map.layerTiles[higher][y][x] = null;
      }
      this.map.elevation[y][x] = layer;
      if (layer === 0) {
        this.map.stairs[y][x] = 0;
      }
    }
    this.map.tileOverrides[y][x] = null;
    this.map.decorations[y][x] = null;
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
        const fresh = createFreshMap001();
        copyMapStateFrom(this.map, fresh);
        syncBarracksPointsFromBuildings(this.map);
        this.scene.redrawTerrain();
        this.scene.syncEnemyBarracksTargets();
        localStorage.removeItem(MAP_STORAGE_KEY);
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
      this.setActiveLayer(0);
    } else if (event.key === "2") {
      this.setActiveLayer(1);
    } else if (event.key === "3") {
      this.setActiveLayer(2);
    } else if (event.key === "4") {
      this.setActiveLayer(3);
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
        if (typeof ev !== "number" || ev < 0 || ev >= MAP_TILE_LAYER_COUNT) {
          return false;
        }
        this.map.elevation[y][x] = Math.floor(ev);
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
          this.map.tileOverrides[y][x] = normalizeLayerTile(v);
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

    if (Array.isArray(d.layerTiles) && d.layerTiles.length === MAP_TILE_LAYER_COUNT) {
      this.map.layerTiles = d.layerTiles;
    } else {
      this.map.layerTiles = undefined;
    }
    ensureMapLayerTiles(this.map);

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
    ensureMapLayerTiles(this.map);
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
    ensureMapLayerTiles(this.map);
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
      layerTiles: this.map.layerTiles.map((grid) =>
        grid.map((row) => row.map((cell) => cloneLayerTile(normalizeLayerTile(cell)))),
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

    if (this.tool === "placeBuilding") {
      this._isPainting = true;
      this._applyPlaceBuildingAt(cell.x, cell.y);
      return true;
    }

    if (this.tool === "brush" || this.tool === "paint") {
      this._isPainting = true;
      this._applyPaintAt(cell.x, cell.y);
      return true;
    }

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
    if (this._isPainting && this.tool === "placeBuilding" && pointer.leftButtonDown()) {
      const cell = this.scene.pointerToCell(pointer);
      if (cell) {
        this._applyPlaceBuildingAt(cell.x, cell.y);
      }
      return true;
    }
    if (!this._isPainting || (this.tool !== "brush" && this.tool !== "paint")) {
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
    if (this.editorMode !== "map" || this.map.buildings[y][x] != null) {
      return;
    }

    const tile = this.brushEraser ? null : { sheet: this.pickerSheet, frame: this.pickerFrame };
    this._setLayerTileAt(x, y, tile);
    this.scene.redrawTerrain();
    this._markDirty();
  }

  _applyPlaceBuildingAt(x, y) {
    const type = this.placeBuildingType;
    if (!type || typeof type !== "string") {
      return;
    }
    if (this.map.elevation[y][x] < 1 || this.map.stairs[y][x] === 1) {
      return;
    }
    if (this.map.buildings[y][x] != null && this.map.buildings[y][x] !== type) {
      return;
    }
    this.map.buildings[y][x] = type;
    syncBarracksPointsFromBuildings(this.map);
    this.scene.redrawTerrain();
    this.scene.syncEnemyBarracksTargets();
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
        this.moveStatus = "Move: click a cell with a building";
        this._notifyChange();
        return;
      }
      this.movePickCell = { x, y };
      this.moveStatus = `Move: picked (${x}, ${y}) — click destination`;
      this._notifyChange();
      this.scene.redrawTerrain();
      return;
    }

    const from = this.movePickCell;
    const moving = this.map.buildings[from.y][from.x];
    if (moving == null) {
      this.movePickCell = null;
      this.moveStatus = "Move: picked building missing, pick again";
      this._notifyChange();
      this.scene.redrawTerrain();
      return;
    }

    if (x === from.x && y === from.y) {
      this.movePickCell = null;
      this.moveStatus = "Move: selection cleared";
      this._notifyChange();
      this.scene.redrawTerrain();
      return;
    }

    if (this.map.buildings[y][x] != null) {
      this.moveStatus = "Move blocked: destination has a building";
      this._notifyChange();
      return;
    }

    if (this.map.elevation[y][x] < 1 || this.map.stairs[y][x] === 1) {
      this.moveStatus = "Move blocked: destination must be land without stairs";
      this._notifyChange();
      return;
    }

    this.map.buildings[from.y][from.x] = null;
    this.map.buildings[y][x] = moving;
    this.movePickCell = null;
    this.moveStatus = `Move complete: (${from.x}, ${from.y}) -> (${x}, ${y})`;
    syncBarracksPointsFromBuildings(this.map);
    this.scene.redrawTerrain();
    this.scene.syncEnemyBarracksTargets();
    this._markDirty();
  }
}
