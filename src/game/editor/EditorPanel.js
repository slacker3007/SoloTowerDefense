import { BUILDING_ASSETS, getBuildingAsset } from "../buildings/buildingCatalog";
import { getPropAsset, PROP_ASSETS } from "../props/propCatalog";
import { getUnitAsset, UNIT_ASSETS } from "../units/unitCatalog";
import { getUiAsset, UI_ASSETS } from "../ui/uiCatalog";
import { frameIndexToSheetPixels } from "../maps/tileRules";
import {
  DEFAULT_TERRAIN_SHEET,
  getTerrainTileSheet,
  MAP_TILE_LAYER_COUNT,
  TERRAIN_TILESET_ASSETS,
} from "../maps/tileOverrideSchema";

const TILE = 64;
const PICKER_WIDTH = 270;
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
    this.tilePickerCanvas = null;
    /** @type {HTMLHeadingElement | null} */
    this._pickerHeadingEl = null;
    /** @type {HTMLParagraphElement | null} */
    this._tilePickerHintEl = null;
    /** @type {HTMLButtonElement[]} */
    this._sheetButtons = [];
    /** @type {HTMLInputElement | null} */
    this._pathEraseCheckbox = null;
    /** @type {HTMLInputElement | null} */
    this._brushEraserCheckbox = null;
    /** @type {HTMLElement | null} */
    this._mapPanelEl = null;
    /** @type {HTMLElement | null} */
    this._propsPanelEl = null;
    /** @type {HTMLElement | null} */
    this._unitsPanelEl = null;
    /** @type {HTMLElement | null} */
    this._uiPanelEl = null;
    /** @type {HTMLElement | null} */
    this._gameplayPanelEl = null;
    /** @type {Map<string, HTMLInputElement>} */
    this._assetSearchInputs = new Map();
    /** @type {Map<string, { buttons: HTMLButtonElement[], getSelectedKey: () => string }>} */
    this._assetPickers = new Map();
    /** @type {HTMLSelectElement | null} */
    this._shoreSelect = null;
    /** @type {HTMLSelectElement | null} */
    this._plateauSelect = null;
    /** @type {HTMLElement | null} */
    this._buildingsPanelEl = null;
    /** @type {HTMLButtonElement[]} */
    this._layerButtons = [];
    /** @type {HTMLButtonElement[]} */
    this._placeBuildingButtons = [];
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
      "E close · 1-4 layers · 5 move · 6 select · 7 path · Ctrl+S save · Terrain tab: select cells for bulk path";

    const tabRow = document.createElement("div");
    tabRow.className = "editor-panel__tabs";
    const tabDefs = [
      ["terrain", "Terrain"],
      ["buildings", "Buildings"],
      ["props", "Props"],
      ["units", "Units"],
      ["ui", "UI"],
      ["gameplay", "Gameplay"],
    ];
    /** @type {Map<string, HTMLButtonElement>} */
    const tabButtons = new Map();
    for (const [mode, label] of tabDefs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "editor-panel__tab";
      btn.textContent = label;
      tabRow.appendChild(btn);
      tabButtons.set(mode, btn);
    }
    tabButtons.get("terrain")?.classList.add("editor-panel__tab--active");

    this._mapPanelEl = document.createElement("div");
    this._mapPanelEl.className = "editor-panel__tab-panel";
    this._buildingsPanelEl = document.createElement("div");
    this._buildingsPanelEl.className = "editor-panel__tab-panel";
    this._buildingsPanelEl.hidden = true;
    this._propsPanelEl = document.createElement("div");
    this._propsPanelEl.className = "editor-panel__tab-panel";
    this._propsPanelEl.hidden = true;
    this._unitsPanelEl = document.createElement("div");
    this._unitsPanelEl.className = "editor-panel__tab-panel";
    this._unitsPanelEl.hidden = true;
    this._uiPanelEl = document.createElement("div");
    this._uiPanelEl.className = "editor-panel__tab-panel";
    this._uiPanelEl.hidden = true;
    this._gameplayPanelEl = document.createElement("div");
    this._gameplayPanelEl.className = "editor-panel__tab-panel";
    this._gameplayPanelEl.hidden = true;

    const panels = new Map([
      ["terrain", this._mapPanelEl],
      ["buildings", this._buildingsPanelEl],
      ["props", this._propsPanelEl],
      ["units", this._unitsPanelEl],
      ["ui", this._uiPanelEl],
      ["gameplay", this._gameplayPanelEl],
    ]);

    const switchTab = (mode) => {
      for (const [m, btn] of tabButtons) {
        btn.classList.toggle("editor-panel__tab--active", m === mode);
      }
      for (const [m, panel] of panels) {
        panel.hidden = m !== mode;
      }
      this.editor.setEditorMode(mode);
    };
    for (const [mode, btn] of tabButtons) {
      btn.addEventListener("click", () => switchTab(mode));
    }

    const layerSec = document.createElement("section");
    layerSec.className = "editor-panel__section";
    const layerH = document.createElement("h3");
    layerH.textContent = "Layer";
    layerSec.appendChild(layerH);
    const layerRow = document.createElement("div");
    layerRow.className = "editor-panel__btn-row";
    const mkLayer = (label, layer) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "editor-panel__btn editor-panel__btn--small editor-layer-btn";
      b.textContent = label;
      b.dataset.layer = layer;
      b.addEventListener("click", () => this.editor.setActiveLayer(layer));
      layerRow.appendChild(b);
      this._layerButtons.push(b);
    };
    const layerLabels = ["Water", "Ground 1", "Ground 2", "Ground 3"];
    for (let layer = 0; layer < MAP_TILE_LAYER_COUNT; layer += 1) {
      mkLayer(`Layer ${layer} - ${layerLabels[layer]}`, layer);
    }
    layerSec.appendChild(layerRow);

    const brushEraseLabel = document.createElement("label");
    brushEraseLabel.className = "role-radio";
    brushEraseLabel.style.cssText = "width:100%;margin-top:6px;";
    this._brushEraserCheckbox = document.createElement("input");
    this._brushEraserCheckbox.type = "checkbox";
    this._brushEraserCheckbox.addEventListener("change", () => {
      this.editor.setBrushEraser(Boolean(this._brushEraserCheckbox?.checked));
    });
    brushEraseLabel.appendChild(this._brushEraserCheckbox);
    brushEraseLabel.appendChild(document.createTextNode(" Eraser (active layer)"));
    layerSec.appendChild(brushEraseLabel);

    const pickerSec = document.createElement("section");
    pickerSec.className = "editor-panel__section";
    const sheetLabel = document.createElement("h3");
    sheetLabel.textContent = "Asset picker";
    pickerSec.appendChild(sheetLabel);
    const sheetRow = document.createElement("div");
    sheetRow.className = "editor-panel__btn-row editor-panel__sheet-row";
    for (const asset of TERRAIN_TILESET_ASSETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "editor-panel__btn editor-panel__btn--small";
      b.textContent = asset.label.length > 14 ? asset.buttonLabel : asset.label;
      b.title = `${asset.label} (${asset.buttonLabel})`;
      b.dataset.sheetKey = asset.key;
      b.addEventListener("click", () => this.editor.setPickerSheet(asset.key));
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
    this._tilePickerHintEl.textContent = "Pick a tile, choose a layer, then drag on the map.";
    pickerSec.appendChild(this._tilePickerHintEl);
    this.tilePickerCanvas = document.createElement("canvas");
    this.tilePickerCanvas.className = "tile-picker-canvas";
    this.tilePickerCanvas.width = PICKER_WIDTH;
    this.tilePickerCanvas.height = Math.round((PICKER_WIDTH * 384) / 576);
    pickerSec.appendChild(this.tilePickerCanvas);
    this._pickerMove = (ev) => this._onTilePickerMouse(ev, "move");
    this._pickerLeave = () => this._onTilePickerLeave();
    this._pickerClick = (ev) => this._onTilePickerMouse(ev, "click");
    this.tilePickerCanvas.addEventListener("mousemove", this._pickerMove);
    this.tilePickerCanvas.addEventListener("mouseleave", this._pickerLeave);
    this.tilePickerCanvas.addEventListener("click", this._pickerClick);

    const advSec = document.createElement("section");
    advSec.className = "editor-panel__section";
    const advH = document.createElement("h3");
    advH.textContent = "Bulk (optional)";
    advSec.appendChild(advH);
    this._cellHeadingEl = document.createElement("p");
    this._cellHeadingEl.className = "editor-panel__cell-coord";
    this._cellHeadingEl.textContent = "No cell selected";
    advSec.appendChild(this._cellHeadingEl);
    const advToolRow = document.createElement("div");
    advToolRow.className = "editor-panel__btn-row";
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "editor-panel__btn editor-panel__btn--small";
    selectBtn.textContent = "Select cells";
    selectBtn.addEventListener("click", () => this.editor.setSelectTool());
    advToolRow.appendChild(selectBtn);
    const clrT = document.createElement("button");
    clrT.type = "button";
    clrT.className = "editor-panel__btn editor-panel__btn--small";
    clrT.textContent = "Clear layer";
    clrT.addEventListener("click", () => this.editor.clearActiveLayer());
    advToolRow.appendChild(clrT);
    advSec.appendChild(advToolRow);
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
    this._terrainThumb = mkThumbBlock("Active layer");
    advSec.appendChild(thumbRow);

    this._mapPanelEl.appendChild(layerSec);
    this._mapPanelEl.appendChild(pickerSec);
    this._mapPanelEl.appendChild(advSec);

    this._buildAssetPickerPanel(this._buildingsPanelEl, {
      tabId: "buildings",
      title: "Building assets",
      hint: "Click a placed building to move it, or drag on empty land to place.",
      assets: BUILDING_ASSETS,
      getSelectedKey: () => this.editor.placeBuildingType,
      onSelect: (key) => this.editor.setPlaceBuildingType(key),
      registerButton: (btn) => this._placeBuildingButtons.push(btn),
    });
    this._buildAssetPickerPanel(this._propsPanelEl, {
      tabId: "props",
      title: "Props & resources",
      hint: "Drag on land to place. Enable eraser to remove props.",
      assets: PROP_ASSETS,
      getSelectedKey: () => this.editor.placePropType,
      onSelect: (key) => this.editor.setPlacePropType(key),
      eraser: {
        get: () => this.editor.propEraser,
        set: (v) => this.editor.setPropEraser(v),
        label: "Prop eraser",
      },
    });
    this._buildAssetPickerPanel(this._unitsPanelEl, {
      tabId: "units",
      title: "Unit sprites",
      hint: "Drag on land to place. Click placed unit to move. Decorative only.",
      assets: UNIT_ASSETS,
      getSelectedKey: () => this.editor.placeUnitType,
      onSelect: (key) => this.editor.setPlaceUnitType(key),
      eraser: {
        get: () => this.editor.unitEraser,
        set: (v) => this.editor.setUnitEraser(v),
        label: "Unit eraser",
      },
    });
    this._buildAssetPickerPanel(this._uiPanelEl, {
      tabId: "ui",
      title: "UI elements",
      hint: "Drag on land to place UI markers. Click placed marker to move.",
      assets: UI_ASSETS,
      getSelectedKey: () => this.editor.placeUiType,
      onSelect: (key) => this.editor.setPlaceUiType(key),
      eraser: {
        get: () => this.editor.uiEraser,
        set: (v) => this.editor.setUiEraser(v),
        label: "UI eraser",
      },
    });

    const objToolSec = document.createElement("section");
    objToolSec.className = "editor-panel__section";
    const objToolH = document.createElement("h3");
    objToolH.textContent = "Tools";
    objToolSec.appendChild(objToolH);
    const objToolRow = document.createElement("div");
    objToolRow.className = "editor-panel__btn-row";
    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.className = "editor-panel__btn editor-panel__btn--small editor-tool-btn";
    moveBtn.textContent = "Move building";
    moveBtn.addEventListener("click", () => this.editor.setMoveBuildingTool());
    objToolRow.appendChild(moveBtn);
    const pathBtn = document.createElement("button");
    pathBtn.type = "button";
    pathBtn.className = "editor-panel__btn editor-panel__btn--small editor-tool-btn";
    pathBtn.textContent = "Path mask";
    pathBtn.addEventListener("click", () => this.editor.setPathMaskBrush());
    objToolRow.appendChild(pathBtn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "editor-panel__btn editor-panel__btn--small editor-tool-btn";
    delBtn.textContent = "Delete building";
    delBtn.addEventListener("click", () => this.editor.setDeleteBuildingTool());
    objToolRow.appendChild(delBtn);
    const stairsBtn = document.createElement("button");
    stairsBtn.type = "button";
    stairsBtn.className = "editor-panel__btn editor-panel__btn--small editor-tool-btn";
    stairsBtn.textContent = "Stairs";
    stairsBtn.addEventListener("click", () => this.editor.setStairsBrush());
    objToolRow.appendChild(stairsBtn);
    objToolSec.appendChild(objToolRow);

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
    eraseLabel.appendChild(document.createTextNode(" Path eraser (or Shift)"));
    objToolSec.appendChild(pathSec);
    objToolSec.appendChild(eraseLabel);
    const pathHint = document.createElement("p");
    pathHint.className = "editor-panel__picker-hint";
    pathHint.textContent =
      "Paint enemy route cells connecting barracks. Select cells on the Terrain tab, then use bulk path buttons below.";
    objToolSec.appendChild(pathHint);

    const metaSec = document.createElement("div");
    metaSec.className = "editor-panel__btn-row";
    const shoreLabel = document.createElement("label");
    shoreLabel.textContent = "Shore ";
    const shoreSelect = document.createElement("select");
    shoreSelect.className = "editor-panel__select";
    for (const value of ["default", "sand", "rocks"]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      shoreSelect.appendChild(opt);
    }
    shoreSelect.addEventListener("change", () => this.editor.setTilesetShore(shoreSelect.value));
    shoreLabel.appendChild(shoreSelect);
    const plateauLabel = document.createElement("label");
    plateauLabel.textContent = " Plateau ";
    const plateauSelect = document.createElement("select");
    plateauSelect.className = "editor-panel__select";
    for (const value of ["rocks", "default"]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      plateauSelect.appendChild(opt);
    }
    plateauSelect.addEventListener("change", () => this.editor.setTilesetPlateau(plateauSelect.value));
    plateauLabel.appendChild(plateauSelect);
    metaSec.appendChild(shoreLabel);
    metaSec.appendChild(plateauLabel);
    objToolSec.appendChild(metaSec);
    this._shoreSelect = shoreSelect;
    this._plateauSelect = plateauSelect;

    this._gameplayPanelEl.appendChild(objToolSec);
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
    mount.appendChild(tabRow);
    mount.appendChild(this._mapPanelEl);
    mount.appendChild(this._buildingsPanelEl);
    mount.appendChild(this._propsPanelEl);
    mount.appendChild(this._unitsPanelEl);
    mount.appendChild(this._uiPanelEl);
    mount.appendChild(this._gameplayPanelEl);
    mount.appendChild(fileSec);
    mount.appendChild(this.statusEl);

    this.root = mount;
  }

  /**
   * @param {HTMLElement} panelEl
   * @param {{
   *   tabId: string,
   *   title: string,
   *   hint: string,
   *   assets: Array<{ key: string, label: string, category: string, url: string }>,
   *   getSelectedKey: () => string,
   *   onSelect: (key: string) => void,
   *   registerButton?: (btn: HTMLButtonElement) => void,
   *   eraser?: { get: () => boolean, set: (v: boolean) => void, label: string },
   * }} config
   */
  _buildAssetPickerPanel(panelEl, config) {
    const sec = document.createElement("section");
    sec.className = "editor-panel__section";
    const h = document.createElement("h3");
    h.textContent = config.title;
    sec.appendChild(h);
    const hint = document.createElement("p");
    hint.className = "editor-panel__picker-hint";
    hint.textContent = config.hint;
    sec.appendChild(hint);

    if (config.eraser) {
      const eraseLabel = document.createElement("label");
      eraseLabel.className = "role-radio";
      eraseLabel.style.cssText = "width:100%;margin-bottom:6px;display:block;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", () => config.eraser?.set(Boolean(cb.checked)));
      eraseLabel.appendChild(cb);
      eraseLabel.appendChild(document.createTextNode(` ${config.eraser.label}`));
      sec.appendChild(eraseLabel);
    }

    const search = document.createElement("input");
    search.type = "search";
    search.className = "editor-panel__search";
    search.placeholder = "Search assets…";
    sec.appendChild(search);
    this._assetSearchInputs.set(config.tabId, search);

    const grid = document.createElement("div");
    grid.className = "editor-building-grid editor-asset-grid";
    const byCategory = new Map();
    for (const asset of config.assets) {
      if (!byCategory.has(asset.category)) {
        byCategory.set(asset.category, []);
      }
      byCategory.get(asset.category).push(asset);
    }

    const buttons = [];
    for (const [category, assets] of byCategory) {
      const details = document.createElement("details");
      details.className = "editor-building-group";
      details.open = true;
      const summary = document.createElement("summary");
      summary.className = "editor-building-group__title";
      summary.textContent = category;
      details.appendChild(summary);
      const groupGrid = document.createElement("div");
      groupGrid.className = "editor-building-grid__items";
      for (const asset of assets) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-building-item editor-asset-item";
        btn.dataset.assetKey = asset.key;
        btn.dataset.searchText = `${category} ${asset.label}`.toLowerCase();
        btn.title = `${category} · ${asset.label}`;
        const img = document.createElement("img");
        img.src = asset.url;
        img.alt = asset.label;
        img.loading = "lazy";
        btn.appendChild(img);
        const cap = document.createElement("span");
        cap.className = "editor-building-item__label";
        cap.textContent = asset.label;
        btn.appendChild(cap);
        btn.addEventListener("click", () => config.onSelect(asset.key));
        groupGrid.appendChild(btn);
        buttons.push(btn);
        config.registerButton?.(btn);
      }
      details.appendChild(groupGrid);
      grid.appendChild(details);
    }
    sec.appendChild(grid);
    panelEl.appendChild(sec);

    const applyFilter = () => {
      const q = search.value.trim().toLowerCase();
      for (const btn of buttons) {
        const text = btn.dataset.searchText ?? "";
        btn.hidden = q.length > 0 && !text.includes(q);
      }
      for (const details of grid.querySelectorAll("details.editor-building-group")) {
        const visible = details.querySelectorAll(".editor-asset-item:not([hidden])").length > 0;
        details.hidden = !visible;
      }
    };
    search.addEventListener("input", applyFilter);

    this._assetPickers.set(config.tabId, { buttons, getSelectedKey: config.getSelectedKey });
  }

  /**
   * @param {MouseEvent} ev
   * @param {"move"|"click"} kind
   */
  _onTilePickerMouse(ev, kind) {
    if (!this.tilePickerCanvas) {
      return;
    }
    const asset = this._getPickerAsset();
    if (!asset) {
      return;
    }
    const hasSel = this.editor.getSelectedCount() > 0;
    const brushMode = this.editor.editorMode === "terrain";
    if (!hasSel && !brushMode) {
      this._pickerHover = null;
      this._redrawTilePicker();
      return;
    }
    const rect = this.tilePickerCanvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const cw = this.tilePickerCanvas.width;
    const ch = this.tilePickerCanvas.height;
    const cellW = cw / asset.cols;
    const cellH = ch / asset.rows;
    const col = Math.max(0, Math.min(asset.cols - 1, Math.floor(mx / cellW)));
    const row = Math.max(0, Math.min(asset.rows - 1, Math.floor(my / cellH)));
    if (kind === "move") {
      this._pickerHover = { col, row };
      this._redrawTilePicker();
    } else {
      const frame = row * asset.cols + col;
      if (frame >= asset.frameCount) {
        return;
      }
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

  _getPickerAsset() {
    return getTerrainTileSheet(this.editor.pickerSheet) ?? getTerrainTileSheet(DEFAULT_TERRAIN_SHEET);
  }

  _getColor1Image() {
    return this._tileImages.get(DEFAULT_TERRAIN_SHEET) ?? null;
  }

  _resizeTilePickerCanvas() {
    const asset = this._getPickerAsset();
    const canvas = this.tilePickerCanvas;
    if (!canvas || !asset) {
      return;
    }
    const nextHeight = Math.max(1, Math.round((PICKER_WIDTH * asset.rows) / asset.cols));
    if (canvas.width !== PICKER_WIDTH || canvas.height !== nextHeight) {
      canvas.width = PICKER_WIDTH;
      canvas.height = nextHeight;
    }
  }

  _redrawTilePicker() {
    const canvas = this.tilePickerCanvas;
    if (!canvas) {
      return;
    }
    this._resizeTilePickerCanvas();
    const asset = this._getPickerAsset();
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const disabled = this.editor.getSelectedCount() === 0 && this.editor.editorMode !== "terrain";
    const img = this._getPickerImage();
    if (img && asset) {
      ctx.globalAlpha = disabled ? 0.35 : 1;
      ctx.drawImage(img, 0, 0, asset.width, asset.height, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "#2a3548";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (!asset) {
      return;
    }
    const cellW = canvas.width / asset.cols;
    const cellH = canvas.height / asset.rows;
    if (
      this._pickerHover &&
      this._pickerHover.col < asset.cols &&
      this._pickerHover.row < asset.rows &&
      !disabled
    ) {
      ctx.strokeStyle = "#5cb3ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(this._pickerHover.col * cellW + 1, this._pickerHover.row * cellH + 1, cellW - 2, cellH - 2);
    }
    const sel = this.editor.selectedCell;
    if (sel && !disabled) {
      const map = this.editor.map;
      let highlightFrame = null;
      const v = map.layerTiles?.[this.editor.activeLayer]?.[sel.y]?.[sel.x];
      if (v != null && typeof v === "object" && v.sheet === this.editor.pickerSheet && typeof v.frame === "number") {
        highlightFrame = v.frame;
      }
      if (highlightFrame != null && highlightFrame >= 0 && highlightFrame < asset.frameCount) {
        ctx.strokeStyle = "#f5d742";
        ctx.lineWidth = 2;
        const c = highlightFrame % asset.cols;
        const r = Math.floor(highlightFrame / asset.cols);
        ctx.strokeRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
      }
    }
  }

  _loadTilemapImages() {
    let remaining = TERRAIN_TILESET_ASSETS.length;
    if (remaining === 0) {
      this._redrawThumbs();
      this._redrawTilePicker();
      this.refresh();
      return;
    }
    const onOneDone = () => {
      remaining -= 1;
      if (remaining <= 0) {
        this._redrawThumbs();
        this._redrawTilePicker();
        this.refresh();
      }
    };

    for (const asset of TERRAIN_TILESET_ASSETS) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this._tileImages.set(asset.key, img);
        onOneDone();
      };
      img.onerror = () => {
        onOneDone();
      };
      img.src = asset.url;
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
    const asset = getTerrainTileSheet(sheetKey) ?? getTerrainTileSheet(DEFAULT_TERRAIN_SHEET);
    if (asset && (frame < 0 || frame >= asset.frameCount)) {
      return;
    }
    const { sx, sy } = frameIndexToSheetPixels(frame, asset?.cols ?? 9);
    ctx.drawImage(img, sx, sy, TILE, TILE, 0, 0, THUMB, THUMB);
  }

  _redrawThumbs() {
    const sel = this.editor.selectedCell;
    const map = this.editor.map;
    if (!this._terrainThumb || !this._cellHeadingEl) {
      return;
    }
    if (sel == null) {
      this._cellHeadingEl.textContent = "No cells selected";
      const tctx = this._terrainThumb.getContext("2d");
      tctx?.clearRect(0, 0, THUMB, THUMB);
      if (tctx) {
        tctx.fillStyle = "#0d1118";
        tctx.fillRect(0, 0, THUMB, THUMB);
      }
      return;
    }
    const count = this.editor.getSelectedCount();
    this._cellHeadingEl.textContent =
      count > 1
        ? `${count} cells selected · Primary (${sel.x}, ${sel.y}) · Layer ${this.editor.activeLayer}`
        : `Cell (${sel.x}, ${sel.y}) · Layer ${this.editor.activeLayer}`;
    const tile = map.layerTiles?.[this.editor.activeLayer]?.[sel.y]?.[sel.x];
    if (tile != null && typeof tile === "object" && typeof tile.sheet === "string" && typeof tile.frame === "number") {
      this._drawThumbFrame(this._terrainThumb, tile.frame, tile.sheet);
    } else {
      const tctx = this._terrainThumb.getContext("2d");
      if (tctx) {
        tctx.fillStyle = "#0d1118";
        tctx.fillRect(0, 0, THUMB, THUMB);
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
    const layerNames = ["water", "ground 1", "ground 2", "ground 3"];
    const layerLabel = e.editorMode === "terrain" ? `Layer: ${e.activeLayer} (${layerNames[e.activeLayer] ?? "?"})` : "";

    let moveLine = "";
    if (e.tool === "moveBuilding") {
      const picked = e.getMovePickCell();
      moveLine = e.getMoveStatus() || (picked ? `Move: picked (${picked.x}, ${picked.y}) — click destination` : "Move: click a building");
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

    let placeLine = "";
    if (e.tool === "placeBuilding") {
      const picked = e.getMovePickCell();
      if (picked) {
        placeLine = e.getMoveStatus() || `Move: picked (${picked.x}, ${picked.y}) — click destination`;
      } else {
        const building = getBuildingAsset(e.placeBuildingType);
        placeLine = building
          ? `Place: ${building.label} (drag on empty land · click building to move)`
          : `Place: ${e.placeBuildingType} (drag on empty land · click building to move)`;
      }
    }

    let propLine = "";
    if (e.tool === "placeProp") {
      const asset = getPropAsset(e.placePropType);
      propLine = asset ? `Prop: ${asset.label}` : "";
    }
    let unitLine = "";
    if (e.tool === "placeUnit") {
      const picked = e.getUnitPickCell();
      if (picked) {
        unitLine = e.getMoveStatus() || `Move: picked (${picked.x}, ${picked.y})`;
      } else {
        const asset = getUnitAsset(e.placeUnitType);
        unitLine = asset ? `Unit: ${asset.label}` : "";
      }
    }
    let uiLine = "";
    if (e.tool === "placeUi") {
      const picked = e.getUiPickCell();
      if (picked) {
        uiLine = e.getMoveStatus() || `Move: picked (${picked.x}, ${picked.y})`;
      } else {
        const asset = getUiAsset(e.placeUiType);
        uiLine = asset ? `UI: ${asset.label}` : "";
      }
    }

    const pickerLine = e.editorMode === "terrain" ? `Picker: ${e.pickerSheet} #${e.pickerFrame}` : "";

    this.statusEl.textContent = [
      `Mode: ${e.editorMode}`,
      layerLabel,
      `Tool: ${e.tool}`,
      moveLine,
      selLine,
      pathLine,
      placeLine,
      propLine,
      unitLine,
      uiLine,
      pickerLine,
    ]
      .filter(Boolean)
      .join(" · ");

    if (this._pickerHeadingEl) {
      const asset = getTerrainTileSheet(e.pickerSheet);
      this._pickerHeadingEl.textContent = `Tile picker${asset ? ` (${asset.label})` : ""}`;
    }

    for (const b of this.toolButtons) {
      b.classList.remove("editor-tool-btn--active");
    }
    if (this.root && e.editorMode === "gameplay") {
      const toolBtns = this.root.querySelectorAll(".editor-tool-btn");
      for (const btn of toolBtns) {
        const label = btn.textContent ?? "";
        const isMove = e.tool === "moveBuilding" && label === "Move building";
        const isPath = e.tool === "pathMask" && label === "Path mask";
        const isDel = e.tool === "deleteBuilding" && label === "Delete building";
        const isStairs = e.tool === "stairs" && label === "Stairs";
        btn.classList.toggle("editor-tool-btn--active", isMove || isPath || isDel || isStairs);
      }
    }
    if (this._shoreSelect) {
      this._shoreSelect.value = e.map.tilesets?.shore ?? "default";
    }
    if (this._plateauSelect) {
      this._plateauSelect.value = e.map.tilesets?.plateau ?? "rocks";
    }
    for (const { buttons, getSelectedKey } of this._assetPickers.values()) {
      const key = getSelectedKey();
      for (const btn of buttons) {
        btn.classList.toggle("editor-building-item--selected", btn.dataset.assetKey === key);
      }
    }
    if (this.root && e.editorMode === "buildings") {
      for (const btn of this._placeBuildingButtons) {
        btn.classList.toggle("editor-building-item--selected", btn.dataset.buildingType === e.placeBuildingType);
      }
    }

    for (const btn of this._layerButtons) {
      btn.classList.toggle("editor-panel__btn--primary", Number(btn.dataset.layer) === e.activeLayer);
    }
    for (const btn of this._placeBuildingButtons) {
      btn.classList.toggle("editor-panel__btn--primary", btn.dataset.buildingType === e.placeBuildingType);
    }

    if (this._pathEraseCheckbox) {
      this._pathEraseCheckbox.checked = e.pathMaskErase;
    }
    if (this._brushEraserCheckbox) {
      this._brushEraserCheckbox.checked = e.brushEraser;
    }

    for (const btn of this._sheetButtons) {
      const key = btn.dataset.sheetKey;
      btn.classList.toggle("editor-panel__btn--primary", key === e.pickerSheet);
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
          ? "Pick a tile, choose a layer, then drag on the map. Bulk: use Select cells below."
          : "Click a tile to set brush, or apply it to selected cells on the active layer.";
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
    this.statusEl = null;
    this.saveBtn = null;
    this.saveStateEl = null;
    this._cellHeadingEl = null;
    this._terrainThumb = null;
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
