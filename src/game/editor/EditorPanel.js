import { deriveLayers } from "../maps/elevation";
import { TILESET_PRESETS, frameIndexToSheetPixels, getHighGroundFrameIndex, getShoreFrameIndex } from "../maps/tileRules";
import { DEFAULT_TERRAIN_SHEET, TERRAIN_TILE_SHEETS } from "../maps/tileOverrideSchema";

const TINY_SWORDS_TILESET_BASE = "/TinySwords/Terrain/Tileset";
/** @type {Record<string, string>} */
const TERRAIN_SHEET_URLS = {
  terrainColor1: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color1.png`,
  terrainColor2: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color2.png`,
  terrainColor3: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color3.png`,
  terrainColor4: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color4.png`,
  terrainColor5: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color5.png`,
  terrainColor6: `${TINY_SWORDS_TILESET_BASE}/Tilemap_color6.png`,
};

const PREVIEW_SIZE = 44;
const TILE = 64;
const TILEMAP_COLS = 9;
const TILEMAP_ROWS = 6;
const THUMB = 28;

/**
 * DOM side panel for map editor (tools, tileset presets, file actions).
 */
export class EditorPanel {
  /**
   * @param {import("./MapEditor.js").MapEditor} editor
   */
  constructor(editor) {
    this.editor = editor;
    /** @type {HTMLElement | null} */
    this.root = null;
    /** @type {HTMLButtonElement[]} */
    this.toolButtons = [];
    /** @type {Record<string, HTMLButtonElement>} */
    this.shorePresetEls = {};
    /** @type {Record<string, HTMLButtonElement>} */
    this.plateauPresetEls = {};
    /** @type {HTMLParagraphElement | null} */
    this.statusEl = null;
    /** @type {HTMLButtonElement | null} */
    this.saveBtn = null;
    /** @type {HTMLSpanElement | null} */
    this.saveStateEl = null;
    /** @type {HTMLHeadingElement | null} */
    this._cellHeadingEl = null;
    /** @type {HTMLCanvasElement | null} */
    this._terrainThumb = null;
    /** @type {HTMLCanvasElement | null} */
    this._decThumb = null;
    /** @type {HTMLInputElement[]} */
    this._roleRadios = [];
    /** @type {HTMLCanvasElement | null} */
    this.tilePickerCanvas = null;
    /** @type {HTMLHeadingElement | null} */
    this._pickerHeadingEl = null;
    /** @type {HTMLParagraphElement | null} */
    this._tilePickerHintEl = null;
    /** @type {HTMLButtonElement[]} */
    this._sheetButtons = [];
    /** @type {HTMLInputElement | null} */
    this._pathEraseCheckbox = null;
    /** @type {{ col: number, row: number } | null} */
    this._pickerHover = null;
    /** @type {Map<string, HTMLImageElement>} */
    this._tileImages = new Map();
    /** @type {((ev: MouseEvent) => void) | null} */
    this._pickerMove = null;
    /** @type {(() => void) | null} */
    this._pickerLeave = null;
    /** @type {((ev: MouseEvent) => void) | null} */
    this._pickerClick = null;

    this._buildDom();
    this._loadTilemapImages();

    editor.bindDomPanel(this);
  }

  _buildDom() {
    const mount = document.getElementById("editor-panel");
    if (!mount) {
      return;
    }

    mount.innerHTML = "";
    mount.className = "editor-panel";
    mount.hidden = true;
    mount.style.height = "100%";
    mount.style.maxHeight = "100%";
    mount.style.overscrollBehavior = "contain";

    const title = document.createElement("h2");
    title.className = "editor-panel__title";
    title.textContent = "Map editor";

    const hint = document.createElement("p");
    hint.className = "editor-panel__hint";
    hint.textContent =
      "Press E to close · 1–3 terrain, 4 stairs, 5 move, 6 select, 7 path mask · G = route preview · Ctrl+S save";

    const toolsSec = document.createElement("section");
    toolsSec.className = "editor-panel__section";
    const toolsLabel = document.createElement("h3");
    toolsLabel.textContent = "Tools";
    toolsSec.appendChild(toolsLabel);

    const toolGrid = document.createElement("div");
    toolGrid.className = "editor-panel__tool-grid editor-panel__tool-grid--seven";

    const mkTool = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "editor-panel__btn editor-tool-btn";
      b.textContent = label;
      b.addEventListener("click", onClick);
      toolGrid.appendChild(b);
      this.toolButtons.push(b);
      return b;
    };

    mkTool("Water", () => this.editor.setElevationBrush(0));
    mkTool("Grass", () => this.editor.setElevationBrush(1));
    mkTool("High ground", () => this.editor.setElevationBrush(2));
    mkTool("Stairs", () => this.editor.setStairsBrush());
    mkTool("Move building", () => this.editor.setMoveBuildingTool());
    mkTool("Select cell", () => this.editor.setSelectTool());
    mkTool("Path mask", () => this.editor.setPathMaskBrush());

    const pathSec = document.createElement("div");
    pathSec.className = "editor-panel__btn-row";
    const markPath = document.createElement("button");
    markPath.type = "button";
    markPath.className = "editor-panel__btn editor-panel__btn--small";
    markPath.textContent = "Path: mark selected";
    markPath.addEventListener("click", () => this.editor.setPathMaskOnSelected(true));
    const clearPath = document.createElement("button");
    clearPath.type = "button";
    clearPath.className = "editor-panel__btn editor-panel__btn--small";
    clearPath.textContent = "Path: clear selected";
    clearPath.addEventListener("click", () => this.editor.setPathMaskOnSelected(false));
    pathSec.appendChild(markPath);
    pathSec.appendChild(clearPath);
    const eraseLabel = document.createElement("label");
    eraseLabel.className = "role-radio";
    eraseLabel.style.cssText = "width:100%;";
    this._pathEraseCheckbox = document.createElement("input");
    this._pathEraseCheckbox.type = "checkbox";
    this._pathEraseCheckbox.addEventListener("change", () => {
      this.editor.setPathMaskErase(Boolean(this._pathEraseCheckbox?.checked));
    });
    eraseLabel.appendChild(this._pathEraseCheckbox);
    eraseLabel.appendChild(document.createTextNode(" Path brush eraser (or Shift)"));
    toolsSec.appendChild(toolGrid);
    toolsSec.appendChild(pathSec);
    const pathHint = document.createElement("p");
    pathHint.className = "editor-panel__picker-hint";
    pathHint.style.marginTop = "6px";
    pathHint.textContent =
      "Paint allowed route cells. Enemies BFS on marked cells. Connect red barracks to blue. Shift-drag erases.";
    toolsSec.appendChild(eraseLabel);
    toolsSec.appendChild(pathHint);

    const shoreSec = this._makePresetSection("Shore (grass / water)", "shore", TILESET_PRESETS.shore, (key) =>
      this.editor.setTilesetPreset("shore", key),
    );
    const plateauSec = this._makePresetSection("High ground (plateau)", "plateau", TILESET_PRESETS.plateau, (key) =>
      this.editor.setTilesetPreset("plateau", key),
    );

    const cellSec = document.createElement("section");
    cellSec.className = "editor-panel__section";
    const cellH = document.createElement("h3");
    cellH.textContent = "Selected cell";
    cellSec.appendChild(cellH);
    this._cellHeadingEl = document.createElement("p");
    this._cellHeadingEl.className = "editor-panel__cell-coord";
    this._cellHeadingEl.textContent = "No cell selected";
    cellSec.appendChild(this._cellHeadingEl);

    const roleRow = document.createElement("div");
    roleRow.className = "role-radio-row";
    const mkRadio = (label, value, checked) => {
      const lab = document.createElement("label");
      lab.className = "role-radio";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = "picker-role";
      inp.value = value;
      inp.checked = checked;
      inp.addEventListener("change", () => {
        if (inp.checked) {
          this.editor.setPickerRole(/** @type {"terrain"|"decoration"} */ (value));
        }
      });
      this._roleRadios.push(inp);
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(` ${label}`));
      roleRow.appendChild(lab);
    };
    mkRadio("Terrain override", "terrain", true);
    mkRadio("Decoration", "decoration", false);
    cellSec.appendChild(roleRow);

    const thumbRow = document.createElement("div");
    thumbRow.className = "thumb-row";
    const mkThumbBlock = (caption) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb-block";
      const cap = document.createElement("span");
      cap.className = "thumb-block__cap";
      cap.textContent = caption;
      const c = document.createElement("canvas");
      c.width = THUMB;
      c.height = THUMB;
      c.className = "thumb-canvas";
      wrap.appendChild(cap);
      wrap.appendChild(c);
      thumbRow.appendChild(wrap);
      return c;
    };
    this._terrainThumb = mkThumbBlock("Terrain");
    this._decThumb = mkThumbBlock("Decoration");

    const clearRow = document.createElement("div");
    clearRow.className = "editor-panel__btn-row";
    const clrT = document.createElement("button");
    clrT.type = "button";
    clrT.className = "editor-panel__btn editor-panel__btn--small";
    clrT.textContent = "Clear terrain";
    clrT.addEventListener("click", () => this.editor.clearTerrainOverride());
    const clrD = document.createElement("button");
    clrD.type = "button";
    clrD.className = "editor-panel__btn editor-panel__btn--small";
    clrD.textContent = "Clear decoration";
    clrD.addEventListener("click", () => this.editor.clearDecoration());
    clearRow.appendChild(clrT);
    clearRow.appendChild(clrD);
    cellSec.appendChild(thumbRow);
    cellSec.appendChild(clearRow);

    const pickerSec = document.createElement("section");
    pickerSec.className = "editor-panel__section";

    const sheetLabel = document.createElement("h3");
    sheetLabel.textContent = "Terrain tilemap";
    pickerSec.appendChild(sheetLabel);
    const sheetRow = document.createElement("div");
    sheetRow.className = "editor-panel__btn-row editor-panel__sheet-row";
    for (let i = 0; i < TERRAIN_TILE_SHEETS.length; i += 1) {
      const key = TERRAIN_TILE_SHEETS[i];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "editor-panel__btn editor-panel__btn--small";
      b.textContent = `Color ${i + 1}`;
      b.dataset.sheetKey = key;
      b.addEventListener("click", () => this.editor.setPickerSheet(key));
      sheetRow.appendChild(b);
      this._sheetButtons.push(b);
    }
    pickerSec.appendChild(sheetRow);

    this._pickerHeadingEl = document.createElement("h3");
    this._pickerHeadingEl.className = "editor-panel__picker-title";
    this._pickerHeadingEl.textContent = "Tile picker";
    pickerSec.appendChild(this._pickerHeadingEl);
    this._tilePickerHintEl = document.createElement("p");
    this._tilePickerHintEl.className = "editor-panel__picker-hint editor-panel__tile-picker-hint";
    this._tilePickerHintEl.textContent = "Select a cell first, choose role above, then click a tile.";
    pickerSec.appendChild(this._tilePickerHintEl);
    this.tilePickerCanvas = document.createElement("canvas");
    this.tilePickerCanvas.className = "tile-picker-canvas";
    const pw = 270;
    const ph = Math.round((pw * 384) / 576);
    this.tilePickerCanvas.width = pw;
    this.tilePickerCanvas.height = ph;
    pickerSec.appendChild(this.tilePickerCanvas);

    this._pickerMove = (ev) => this._onTilePickerMouse(ev, "move");
    this._pickerLeave = () => this._onTilePickerLeave();
    this._pickerClick = (ev) => this._onTilePickerMouse(ev, "click");
    this.tilePickerCanvas.addEventListener("mousemove", this._pickerMove);
    this.tilePickerCanvas.addEventListener("mouseleave", this._pickerLeave);
    this.tilePickerCanvas.addEventListener("click", this._pickerClick);

    const fileSec = document.createElement("section");
    fileSec.className = "editor-panel__section";
    const fileLabel = document.createElement("h3");
    fileLabel.textContent = "File";
    fileSec.appendChild(fileLabel);

    const fileRow = document.createElement("div");
    fileRow.className = "editor-panel__btn-row";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "editor-panel__btn editor-panel__btn--primary";
    save.textContent = "Save map";
    save.addEventListener("click", () => this.editor.saveMap());

    const exp = document.createElement("button");
    exp.type = "button";
    exp.className = "editor-panel__btn";
    exp.textContent = "Export JSON";
    exp.addEventListener("click", () => this.editor.exportJson());

    const imp = document.createElement("button");
    imp.type = "button";
    imp.className = "editor-panel__btn";
    imp.textContent = "Import JSON";
    imp.addEventListener("click", () => this.editor.triggerImportFilePicker());

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "editor-panel__btn editor-panel__btn--warn";
    reset.textContent = "Reset map";
    reset.addEventListener("click", () => {
      if (window.confirm("Reset map to default layout? Unsaved edits will be lost.")) {
        this.editor.resetToDefault();
      }
    });

    this.saveBtn = save;
    fileRow.appendChild(save);
    fileRow.appendChild(exp);
    fileRow.appendChild(imp);
    fileSec.appendChild(fileRow);
    fileSec.appendChild(reset);
    this.saveStateEl = document.createElement("span");
    this.saveStateEl.className = "save-state";
    fileSec.appendChild(this.saveStateEl);

    this.statusEl = document.createElement("p");
    this.statusEl.className = "editor-panel__status";

    mount.appendChild(title);
    mount.appendChild(hint);
    mount.appendChild(toolsSec);
    mount.appendChild(shoreSec);
    mount.appendChild(plateauSec);
    mount.appendChild(cellSec);
    mount.appendChild(pickerSec);
    mount.appendChild(fileSec);
    mount.appendChild(this.statusEl);

    this.root = mount;
  }

  /**
   * @param {MouseEvent} ev
   * @param {"move"|"click"} kind
   */
  _onTilePickerMouse(ev, kind) {
    if (!this.tilePickerCanvas) {
      return;
    }
    const hasSel = this.editor.getSelectedCount() > 0;
    if (!hasSel) {
      this._pickerHover = null;
      this._redrawTilePicker();
      return;
    }
    const rect = this.tilePickerCanvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const cw = this.tilePickerCanvas.width;
    const ch = this.tilePickerCanvas.height;
    const cellW = cw / TILEMAP_COLS;
    const cellH = ch / TILEMAP_ROWS;
    const col = Math.max(0, Math.min(TILEMAP_COLS - 1, Math.floor(mx / cellW)));
    const row = Math.max(0, Math.min(TILEMAP_ROWS - 1, Math.floor(my / cellH)));
    if (kind === "move") {
      this._pickerHover = { col, row };
      this._redrawTilePicker();
    } else {
      const frame = row * TILEMAP_COLS + col;
      this.editor.applyPickedTileFrame(frame);
    }
  }

  _onTilePickerLeave() {
    this._pickerHover = null;
    this._redrawTilePicker();
  }

  _getPickerImage() {
    return this._tileImages.get(this.editor.pickerSheet) ?? this._tileImages.get(DEFAULT_TERRAIN_SHEET) ?? null;
  }

  _getColor1Image() {
    return this._tileImages.get(DEFAULT_TERRAIN_SHEET) ?? null;
  }

  _redrawTilePicker() {
    const canvas = this.tilePickerCanvas;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const disabled = this.editor.getSelectedCount() === 0;
    const img = this._getPickerImage();
    if (img) {
      ctx.globalAlpha = disabled ? 0.35 : 1;
      ctx.drawImage(img, 0, 0, 576, 384, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "#2a3548";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const cellW = canvas.width / TILEMAP_COLS;
    const cellH = canvas.height / TILEMAP_ROWS;
    if (this._pickerHover && !disabled) {
      ctx.strokeStyle = "#5cb3ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(this._pickerHover.col * cellW + 1, this._pickerHover.row * cellH + 1, cellW - 2, cellH - 2);
    }
    const sel = this.editor.selectedCell;
    if (sel && !disabled) {
      const map = this.editor.map;
      let highlightFrame = null;
      if (this.editor.pickerRole === "terrain") {
        const v = map.tileOverrides[sel.y][sel.x];
        if (v != null && typeof v === "object" && v.sheet === this.editor.pickerSheet && typeof v.frame === "number") {
          highlightFrame = v.frame;
        }
      } else {
        const d = map.decorations[sel.y][sel.x];
        if (d && d.sheet === this.editor.pickerSheet && typeof d.frame === "number") {
          highlightFrame = d.frame;
        }
      }
      if (highlightFrame != null) {
        const c = highlightFrame % TILEMAP_COLS;
        const r = Math.floor(highlightFrame / TILEMAP_COLS);
        ctx.strokeStyle = "#f5d742";
        ctx.lineWidth = 2;
        ctx.strokeRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
      }
    }
  }

  /**
   * @param {string} heading
   * @param {"shore" | "plateau"} layer
   * @param {Record<string, { byMask: Record<number, number>, fallback: number }>} presets
   * @param {(key: string) => void} onPick
   */
  _makePresetSection(heading, layer, presets, onPick) {
    const sec = document.createElement("section");
    sec.className = "editor-panel__section";
    const h = document.createElement("h3");
    h.textContent = heading;
    sec.appendChild(h);

    const row = document.createElement("div");
    row.className = "editor-panel__preset-row";

    for (const key of Object.keys(presets)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "preset-card";
      card.dataset.presetKey = key;
      card.dataset.layer = layer;

      const label = document.createElement("span");
      label.className = "preset-card__label";
      label.textContent = key === "default" ? "Default" : key === "rocks" ? "Rocks" : key === "mirrorShore" ? "Mirror shore" : key;

      const canvas = document.createElement("canvas");
      canvas.width = PREVIEW_SIZE * 3 + 8;
      canvas.height = PREVIEW_SIZE + 4;
      canvas.className = "preset-card__canvas";
      canvas.dataset.previewLayer = layer;
      canvas.dataset.previewKey = key;

      card.appendChild(canvas);
      card.appendChild(label);
      card.addEventListener("click", () => onPick(key));

      row.appendChild(card);
      if (layer === "shore") {
        this.shorePresetEls[key] = card;
      } else {
        this.plateauPresetEls[key] = card;
      }
    }

    sec.appendChild(row);
    return sec;
  }

  _loadTilemapImages() {
    let remaining = TERRAIN_TILE_SHEETS.length;
    const onOneDone = () => {
      remaining -= 1;
      if (remaining <= 0) {
        this._drawAllPresetPreviews();
        this._redrawThumbs();
        this._redrawTilePicker();
        this.refresh();
      }
    };

    for (const key of TERRAIN_TILE_SHEETS) {
      const src = TERRAIN_SHEET_URLS[key];
      if (!src) {
        onOneDone();
        continue;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this._tileImages.set(key, img);
        onOneDone();
      };
      img.onerror = () => {
        onOneDone();
      };
      img.src = src;
    }
  }

  _drawAllPresetPreviews() {
    const color1 = this._getColor1Image();
    if (!this.root || !color1) {
      return;
    }
    const canvases = this.root.querySelectorAll("canvas[data-preview-layer]");
    canvases.forEach((canvas) => {
      const layer = /** @type {HTMLElement} */ (canvas).dataset.previewLayer;
      const key = /** @type {HTMLElement} */ (canvas).dataset.previewKey;
      if (!layer || !key) {
        return;
      }
      const bucket = TILESET_PRESETS[/** @type {"shore"|"plateau"} */ (layer)];
      const preset = bucket?.[key];
      if (!preset) {
        return;
      }
      const f1 = preset.byMask[6] ?? preset.fallback;
      const f2 = preset.byMask[15] ?? preset.fallback;
      const f3 = preset.byMask[9] ?? preset.fallback;
      this._drawThreeTiles(/** @type {HTMLCanvasElement} */ (canvas), color1, f1, f2, f3);
    });
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement} sheetImage
   * @param {number} a
   * @param {number} b
   * @param {number} c
   */
  _drawThreeTiles(canvas, sheetImage, a, b, c) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !sheetImage) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const frames = [a, b, c];
    for (let i = 0; i < 3; i += 1) {
      const { sx, sy } = frameIndexToSheetPixels(frames[i]);
      const dx = i * (PREVIEW_SIZE + 2);
      ctx.drawImage(sheetImage, sx, sy, TILE, TILE, dx, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    }
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} frame
   * @param {string} [sheetKey]
   */
  _drawThumbFrame(canvas, frame, sheetKey = DEFAULT_TERRAIN_SHEET) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = this._tileImages.get(sheetKey) ?? this._getColor1Image();
    if (!img || !Number.isFinite(frame)) {
      return;
    }
    const { sx, sy } = frameIndexToSheetPixels(frame);
    ctx.drawImage(img, sx, sy, TILE, TILE, 0, 0, THUMB, THUMB);
  }

  _redrawThumbs() {
    const sel = this.editor.selectedCell;
    const map = this.editor.map;
    if (!this._terrainThumb || !this._decThumb || !this._cellHeadingEl) {
      return;
    }
    if (sel == null) {
      this._cellHeadingEl.textContent = "No cells selected";
      const tctx = this._terrainThumb.getContext("2d");
      const dctx = this._decThumb.getContext("2d");
      tctx?.clearRect(0, 0, THUMB, THUMB);
      dctx?.clearRect(0, 0, THUMB, THUMB);
      if (tctx) {
        tctx.fillStyle = "#0d1118";
        tctx.fillRect(0, 0, THUMB, THUMB);
      }
      if (dctx) {
        dctx.fillStyle = "#0d1118";
        dctx.fillRect(0, 0, THUMB, THUMB);
      }
      return;
    }
    const count = this.editor.getSelectedCount();
    this._cellHeadingEl.textContent =
      count > 1 ? `${count} cells selected · Primary (${sel.x}, ${sel.y})` : `Cell (${sel.x}, ${sel.y})`;
    const elev = map.elevation[sel.y][sel.x];
    const layers = deriveLayers(map.elevation);
    const shoreKey = map.tilesets?.shore ?? "default";
    const plateauKey = map.tilesets?.plateau ?? "rocks";
    const ov = map.tileOverrides[sel.y][sel.x];
    let terrainFrame = null;
    if (elev < 1) {
      const tctx = this._terrainThumb.getContext("2d");
      if (tctx) {
        tctx.fillStyle = "#0d1118";
        tctx.fillRect(0, 0, THUMB, THUMB);
      }
    } else if (ov != null && typeof ov === "object" && typeof ov.sheet === "string" && typeof ov.frame === "number") {
      this._drawThumbFrame(this._terrainThumb, ov.frame, ov.sheet);
    } else if (elev >= 2 && layers.highGround[sel.y][sel.x] === 1) {
      terrainFrame = getHighGroundFrameIndex(layers.highGround, sel.x, sel.y, map.width, map.height, plateauKey);
      this._drawThumbFrame(this._terrainThumb, terrainFrame ?? 0, DEFAULT_TERRAIN_SHEET);
    } else if (elev >= 1 && layers.islandMask[sel.y][sel.x] === 1) {
      terrainFrame = getShoreFrameIndex(layers.islandMask, sel.x, sel.y, map.width, map.height, shoreKey);
      this._drawThumbFrame(this._terrainThumb, terrainFrame ?? 0, DEFAULT_TERRAIN_SHEET);
    } else {
      const tctx = this._terrainThumb.getContext("2d");
      if (tctx) {
        tctx.fillStyle = "#0d1118";
        tctx.fillRect(0, 0, THUMB, THUMB);
      }
    }

    const dec = map.decorations[sel.y][sel.x];
    if (dec && typeof dec.frame === "number" && typeof dec.sheet === "string") {
      this._drawThumbFrame(this._decThumb, dec.frame, dec.sheet);
    } else {
      const dctx = this._decThumb.getContext("2d");
      if (dctx) {
        dctx.fillStyle = "#0d1118";
        dctx.fillRect(0, 0, THUMB, THUMB);
      }
    }
  }

  setVisible(visible) {
    if (this.root) {
      this.root.hidden = !visible;
    }
    if (visible) {
      this.refresh();
    }
  }

  refresh() {
    if (!this.root || !this.statusEl) {
      return;
    }

    const e = this.editor;
    const paintLabel =
      e.paintKind === "stairs"
        ? "Stairs (click toggles)"
        : `Elevation ${e.paintElevation} (${["water", "grass", "high"][e.paintElevation] ?? "?"})`;

    let moveLine = "";
    if (e.tool === "moveBuilding") {
      const picked = e.getMovePickCell();
      moveLine = e.getMoveStatus() || (picked ? `Move: picked (${picked.x}, ${picked.y}) — click destination` : "Move: click a barracks");
    }

    let selLine = "";
    if (e.tool === "select") {
      selLine =
        e.getSelectedCount() > 0
          ? `Select: ${e.getSelectedCount()} cells`
          : "Select: click a cell (Shift+Click to add)";
    }

    let pathLine = "";
    if (e.tool === "pathMask") {
      pathLine = e.pathMaskErase
        ? "Path mask: brush erases · Shift also erases"
        : "Path mask: paint route cells (connect barracks)";
    }

    this.statusEl.textContent = [
      `Tool: ${e.tool}`,
      paintLabel,
      moveLine,
      selLine,
      pathLine,
      `Picker sheet: ${e.pickerSheet}`,
      `Shore: ${e.map.tilesets?.shore}`,
      `Plateau: ${e.map.tilesets?.plateau}`,
    ]
      .filter(Boolean)
      .join(" · ");

    if (this._pickerHeadingEl) {
      const idx = TERRAIN_TILE_SHEETS.indexOf(e.pickerSheet);
      const n = idx >= 0 ? idx + 1 : 1;
      this._pickerHeadingEl.textContent = `Tile picker (Tilemap color ${n})`;
    }

    for (const b of this.toolButtons) {
      b.classList.remove("editor-tool-btn--active");
    }
    let idx = 0;
    if (e.tool === "pathMask") {
      idx = 6;
    } else if (e.tool === "select") {
      idx = 5;
    } else if (e.tool === "moveBuilding") {
      idx = 4;
    } else if (e.paintKind === "stairs") {
      idx = 3;
    } else if (e.paintElevation === 0) {
      idx = 0;
    } else if (e.paintElevation === 1) {
      idx = 1;
    } else {
      idx = 2;
    }
    if (this.toolButtons[idx]) {
      this.toolButtons[idx].classList.add("editor-tool-btn--active");
    }

    if (this._pathEraseCheckbox) {
      this._pathEraseCheckbox.checked = e.pathMaskErase;
    }

    for (const btn of this._sheetButtons) {
      const key = btn.dataset.sheetKey;
      btn.classList.toggle("editor-panel__btn--primary", key === e.pickerSheet);
    }

    const shore = e.map.tilesets?.shore ?? "default";
    const plateau = e.map.tilesets?.plateau ?? "rocks";
    for (const [k, el] of Object.entries(this.shorePresetEls)) {
      el.classList.toggle("preset-card--selected", k === shore);
    }
    for (const [k, el] of Object.entries(this.plateauPresetEls)) {
      el.classList.toggle("preset-card--selected", k === plateau);
    }

    for (const inp of this._roleRadios) {
      inp.checked = inp.value === e.pickerRole;
    }

    this._redrawThumbs();
    this._redrawTilePicker();

    if (this.saveStateEl) {
      if (e.isDirty) {
        this.saveStateEl.textContent = "Unsaved changes";
      } else if (e.lastSavedAt instanceof Date) {
        const hh = String(e.lastSavedAt.getHours()).padStart(2, "0");
        const mm = String(e.lastSavedAt.getMinutes()).padStart(2, "0");
        this.saveStateEl.textContent = `Saved at ${hh}:${mm}`;
      } else {
        this.saveStateEl.textContent = "No changes yet";
      }
    }
    if (this.saveBtn) {
      this.saveBtn.textContent = e.isDirty ? "Save map *" : "Save map";
    }

    if (this._tilePickerHintEl) {
      this._tilePickerHintEl.textContent =
        e.getSelectedCount() === 0
          ? "Select cells first (Select tool), choose role, then click a tile."
          : "Click a tile below to apply to all selected cells.";
    }
  }

  destroy() {
    if (this.tilePickerCanvas && this._pickerMove && this._pickerLeave && this._pickerClick) {
      this.tilePickerCanvas.removeEventListener("mousemove", this._pickerMove);
      this.tilePickerCanvas.removeEventListener("mouseleave", this._pickerLeave);
      this.tilePickerCanvas.removeEventListener("click", this._pickerClick);
    }
    this.editor.unbindDomPanel(this);
    if (this.root) {
      this.root.innerHTML = "";
      this.root.hidden = true;
    }
    this.root = null;
    this.toolButtons = [];
    this.shorePresetEls = {};
    this.plateauPresetEls = {};
    this.statusEl = null;
    this.saveBtn = null;
    this.saveStateEl = null;
    this._cellHeadingEl = null;
    this._terrainThumb = null;
    this._decThumb = null;
    this._roleRadios = [];
    this._pickerHeadingEl = null;
    this._tilePickerHintEl = null;
    this._sheetButtons = [];
    this.tilePickerCanvas = null;
    this._pickerMove = null;
    this._pickerLeave = null;
    this._pickerClick = null;
    this._tileImages.clear();
    this._pathEraseCheckbox = null;
  }
}
