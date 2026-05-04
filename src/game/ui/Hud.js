import Phaser from "phaser";
import {
  KEYBIND_ACTION_IDS,
  KEYBIND_DESCRIPTIONS,
  formatKeyLabel,
  isModifierOnlyEvent,
  keyCodeFromBrowserEvent,
} from "../input/KeybindStore.js";

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   maxLives?: number,
   *   keybindStore?: import("../input/KeybindStore.js").KeybindStore | null,
   *   onMapEditorFromMenu?: () => void,
   *   onKeybindsChanged?: () => void,
   *   onCycleGameSpeed?: () => void,
   * }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.maxLives = typeof options.maxLives === "number" ? options.maxLives : 0;
    /** @type {import("../input/KeybindStore.js").KeybindStore | null} */
    this.keybindStore = options.keybindStore ?? null;
    this.onMapEditorFromMenu = typeof options.onMapEditorFromMenu === "function" ? options.onMapEditorFromMenu : () => {};
    this.onKeybindsChanged = typeof options.onKeybindsChanged === "function" ? options.onKeybindsChanged : () => {};
    this.onCycleGameSpeed = typeof options.onCycleGameSpeed === "function" ? options.onCycleGameSpeed : () => {};

    this._menuDropdownOpen = false;
    this._keybindPanelOpen = false;
    /** @type {string | null} */
    this._rebindingActionId = null;
    /** @type {((ev: KeyboardEvent) => void) | null} */
    this._rebindKeyHandler = null;

    this.topBarHeight = 48;
    this.bottomBarHeight = 220;
    this.depth = 100;
    this.rootOffsetX = 0;
    this.rootOffsetY = 0;
    this.rootScale = 1;
    this.actionPanelScale = 1.5625;
    this.actionPanelCorner = "bottom-right";
    this.actionPanelMarginX = 16;
    this.actionPanelMarginY = 16;
    this.actionPanelOffsetX = 80;
    this.actionPanelOffsetY = 40;
    this._selectedBuilding = null;
    this._minimapData = null;
    this._actionButtons = [];
    /** @type {Phaser.GameObjects.Zone[]} Full-cell hit targets for action grid slots (64×64 local space). */
    this._actionHitZones = [];
    this._actionGridBackground = null;
    this._actionIcons = [];
    this._actionSlotConfigs = Array.from({ length: 12 }, () => null);
    this._hoveredActionIndex = -1;
    this._tooltipAnchor = { x: 0, y: 0 };
    this._topVisible = true;
    this._bottomVisible = true;
    this.root = scene.add.container(0, 0);
    this.root.setDepth(this.depth);
    this.root.setScrollFactor(0);

    this.topBackground = scene.add.rectangle(0, 0, scene.scale.width, this.topBarHeight, 0x000000, 0.72);
    this.topBackground.setOrigin(0, 0);

    this.bottomBackground = scene.add.rectangle(0, 0, scene.scale.width, this.bottomBarHeight, 0x000000, 0.82);
    this.bottomBackground.setOrigin(0, 0);

    this.menuButton = this.createButton("Menu", true, () => this.toggleMenuDropdown());
    this.speedButton = this.createButton("Speed x1", true, () => this.onCycleGameSpeed());

    this.menuBackdrop = scene.add.rectangle(0, 0, 800, 600, 0x000011, 0.35);
    this.menuBackdrop.setOrigin(0, 0);
    this.menuBackdrop.setInteractive();
    this.menuBackdrop.on("pointerdown", (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this.closeMenuDropdown();
    });
    this.menuBackdrop.setVisible(false);

    this.menuDropdownBg = scene.add.rectangle(0, 0, 320, 132, 0x1e2a3d, 0.98);
    this.menuDropdownBg.setOrigin(0, 0);
    this.menuDropdownBg.setStrokeStyle(1, 0x7ca8d6, 0.85);

    this.menuBtnMapEditor = this.createButton("Map editor", true, () => {
      this.closeMenuDropdown();
      this.onMapEditorFromMenu();
    });
    this.menuBtnKeybindings = this.createButton("Keybindings", true, () => {
      this.closeMenuDropdown();
      this.openKeybindPanel();
    });

    this.menuDropdownRoot = scene.add.container(0, 0, [this.menuDropdownBg, this.menuBtnMapEditor, this.menuBtnKeybindings]);
    this.menuDropdownRoot.setVisible(false);
    this.menuBtnMapEditor.setPosition(14, 22);
    this.menuBtnKeybindings.setPosition(14, 76);

    this.keybindBackdrop = scene.add.rectangle(0, 0, 800, 600, 0x000000, 0.55);
    this.keybindBackdrop.setOrigin(0, 0);
    this.keybindBackdrop.setInteractive();

    this.keybindPanelBg = scene.add.rectangle(0, 0, 700, 440, 0x152235, 0.98);
    this.keybindPanelBg.setOrigin(0.5, 0.5);
    this.keybindPanelBg.setStrokeStyle(2, 0x7ca8d6, 1);

    this.keybindTitle = scene.add.text(0, 0, "Keybindings", {
      fontFamily: "monospace",
      fontSize: "28px",
      color: "#ffffff",
    });
    this.keybindTitle.setOrigin(0.5, 0);

    /** @type {{ id: string, button: Phaser.GameObjects.Text }[]} */
    this._keybindRowButtons = [];
    for (const id of KEYBIND_ACTION_IDS) {
      const button = this.createButton("", true, () => this.beginRebind(id));
      button.setOrigin(0, 0.5);
      this._keybindRowButtons.push({ id, button });
    }

    this.keybindBackBtn = this.createButton("Back", true, () => this.closeKeybindPanel());
    this.keybindResetBtn = this.createButton("Reset defaults", true, () => {
      this.keybindStore?.resetToDefaults();
      this.refreshKeybindRows();
      this.onKeybindsChanged();
    });

    this.keybindPanelInner = scene.add.container(0, 0, [
      this.keybindPanelBg,
      this.keybindTitle,
      ...this._keybindRowButtons.map((r) => r.button),
      this.keybindBackBtn,
      this.keybindResetBtn,
    ]);

    this.keybindOverlayRoot = scene.add.container(0, 0, [this.keybindBackdrop, this.keybindPanelInner]);
    this.keybindOverlayRoot.setVisible(false);

    this.refreshKeybindRows();

    this.hpText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
    });
    this.goldText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
    });
    this.towersText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
    });
    this.selectedTitleText = scene.add.text(0, 0, "Selected: None", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#ffffff",
    });
    this.selectedHpText = scene.add.text(0, 0, "HP: N/A", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });
    this.selectedCellText = scene.add.text(0, 0, "Cell: -", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });
    this.selectedDamageText = scene.add.text(0, 0, "Damage: -", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });
    this.selectedRangeText = scene.add.text(0, 0, "Range: -", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });

    for (const text of [
      this.hpText,
      this.goldText,
      this.towersText,
      this.selectedTitleText,
      this.selectedHpText,
      this.selectedCellText,
      this.selectedDamageText,
      this.selectedRangeText,
    ]) {
      text.setOrigin(0, 0.5);
    }

    this.hpText.setOrigin(1, 0.5);
    this.goldText.setOrigin(1, 0.5);
    this.towersText.setOrigin(1, 0.5);

    this.minimapFrame = scene.add.rectangle(0, 0, 180, 120, 0x152235, 0.95);
    this.minimapFrame.setOrigin(0, 0);
    this.minimapFrame.setStrokeStyle(2, 0x7ca8d6, 0.9);

    this.minimapGraphics = scene.add.graphics();

    this._actionGridBackground = this.createActionSlotBackground();

    const actionSlotCell = 64;
    for (let i = 0; i < 12; i += 1) {
      const button = this.createButton("", false, null, false);
      button.setOrigin(0.5, 0.5);
      button.setStyle({ backgroundColor: "#00000000" });
      this._actionGridBackground.add(button);
      this._actionButtons.push(button);

      const zone = this.scene.add.zone(0, 0, actionSlotCell, actionSlotCell);
      zone.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(zone);
      this._actionHitZones.push(zone);

      this._actionIcons.push(null);
    }

    this.tooltipBackground = scene.add.rectangle(0, 0, 300, 120, 0x0f1622, 0.95);
    this.tooltipBackground.setOrigin(0, 0);
    this.tooltipBackground.setStrokeStyle(1, 0x7ca8d6, 0.95);
    this.tooltipTitleText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "17px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.tooltipTitleText.setOrigin(0, 0);
    this.tooltipDescriptionText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "24px",
      color: "#d7e2ff",
      wordWrap: { width: 510, useAdvancedWrap: true },
    });
    this.tooltipDescriptionText.setOrigin(0, 0);
    this.tooltipCostText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#ffeaa0",
    });
    this.tooltipCostText.setOrigin(0, 0);
    this.tooltipWarningText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ff9a9a",
    });
    this.tooltipWarningText.setOrigin(0, 0);
    this.tooltipRoot = scene.add.container(0, 0, [
      this.tooltipBackground,
      this.tooltipTitleText,
      this.tooltipDescriptionText,
      this.tooltipCostText,
      this.tooltipWarningText,
    ]);
    this.tooltipRoot.setVisible(false);

    this.root.add([
      this.topBackground,
      this.bottomBackground,
      this.menuButton,
      this.speedButton,
      this.hpText,
      this.goldText,
      this.towersText,
      this.selectedTitleText,
      this.selectedHpText,
      this.selectedCellText,
      this.selectedDamageText,
      this.selectedRangeText,
      this.minimapFrame,
      this.minimapGraphics,
      this._actionGridBackground,
      this.menuBackdrop,
      this.menuDropdownRoot,
      this.keybindOverlayRoot,
      this.tooltipRoot,
    ]);

    this.topUiObjects = [this.topBackground, this.menuButton, this.speedButton, this.hpText, this.goldText, this.towersText];
    this.bottomUiObjects = [
      this.bottomBackground,
      this.minimapFrame,
      this.minimapGraphics,
      this.selectedTitleText,
      this.selectedHpText,
      this.selectedCellText,
      this.selectedDamageText,
      this.selectedRangeText,
      this._actionGridBackground,
    ];
    this.uiObjects = [
      ...this.topUiObjects,
      ...this.bottomUiObjects,
    ];
    this.layout();
  }

  toggleMenuDropdown() {
    this._menuDropdownOpen = !this._menuDropdownOpen;
    this.applyMenuOverlayVisibility();
    this.layout();
  }

  closeMenuDropdown() {
    if (!this._menuDropdownOpen) {
      return;
    }
    this._menuDropdownOpen = false;
    this.applyMenuOverlayVisibility();
    this.layout();
  }

  openKeybindPanel() {
    if (!this.keybindStore) {
      return;
    }
    this.closeMenuDropdown();
    this._keybindPanelOpen = true;
    this.refreshKeybindRows();
    this.applyMenuOverlayVisibility();
    this.layout();
  }

  closeKeybindPanel() {
    if (!this._keybindPanelOpen) {
      return;
    }
    this.endRebind();
    this._keybindPanelOpen = false;
    this.applyMenuOverlayVisibility();
    this.layout();
  }

  isMenuDropdownOpen() {
    return this._menuDropdownOpen;
  }

  isKeybindPanelOpen() {
    return this._keybindPanelOpen;
  }

  isRebindingKey() {
    return this._rebindingActionId != null;
  }

  applyMenuOverlayVisibility() {
    const drop = Boolean(this._topVisible && this._menuDropdownOpen);
    this.menuBackdrop.setVisible(drop);
    this.menuDropdownRoot.setVisible(drop);
    const keys = Boolean(this._keybindPanelOpen);
    this.keybindOverlayRoot.setVisible(keys);
  }

  refreshKeybindRows() {
    if (!this.keybindStore) {
      return;
    }
    const codes = this.keybindStore.getCodes();
    for (const { id, button } of this._keybindRowButtons) {
      const desc = KEYBIND_DESCRIPTIONS[id] ?? id;
      const keyLabel = formatKeyLabel(codes[id]);
      button.setText(`${desc}   [${keyLabel}]   Click to rebind`);
    }
  }

  /**
   * @param {string} actionId
   */
  beginRebind(actionId) {
    if (!this.keybindStore || this._rebindingActionId) {
      return;
    }
    this._rebindingActionId = actionId;
    this._rebindKeyHandler = (/** @type {KeyboardEvent} */ ev) => {
      if (ev.key === "Escape") {
        this.endRebind();
        return;
      }
      if (isModifierOnlyEvent(ev)) {
        return;
      }
      const code = keyCodeFromBrowserEvent(ev);
      if (code == null) {
        return;
      }
      ev.preventDefault();
      const result = this.keybindStore.setBinding(actionId, code);
      if (!result.ok) {
        return;
      }
      this.endRebind();
      this.refreshKeybindRows();
      this.onKeybindsChanged();
    };
    this.scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._rebindKeyHandler);
  }

  endRebind() {
    if (this._rebindKeyHandler) {
      this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._rebindKeyHandler);
      this._rebindKeyHandler = null;
    }
    this._rebindingActionId = null;
  }

  dispose() {
    this.endRebind();
    this.root?.destroy(true);
  }

  setActionSlots(slots = []) {
    const hoveredBefore = this._hoveredActionIndex;
    for (let i = 0; i < this._actionSlotConfigs.length; i += 1) {
      this._actionSlotConfigs[i] = slots[i] ?? null;
      this.updateActionSlotInteractivity(i);
    }
    const hoveredSlot = hoveredBefore >= 0 ? this._actionSlotConfigs[hoveredBefore] : null;
    if (hoveredBefore >= 0 && this.hasActionTooltip(hoveredSlot)) {
      this._hoveredActionIndex = hoveredBefore;
    } else {
      this.hideActionTooltip();
    }
    this.layout();
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  triggerActionSlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._actionSlotConfigs.length) {
      return false;
    }
    const slot = this._actionSlotConfigs[index];
    if (!slot || !slot.enabled || typeof slot.onClick !== "function") {
      return false;
    }
    slot.onClick();
    return true;
  }

  updateActionSlotInteractivity(index) {
    const zone = this._actionHitZones[index];
    const slot = this._actionSlotConfigs[index];
    zone.removeAllListeners();
    if (!slot) {
      zone.disableInteractive();
      return;
    }
    const canClick = Boolean(slot.enabled && typeof slot.onClick === "function");
    const canHover = this.hasActionTooltip(slot);
    if (!canClick && !canHover) {
      zone.disableInteractive();
      return;
    }
    zone.setInteractive({ useHandCursor: canClick });
    if (canClick) {
      zone.on("pointerdown", () => slot.onClick());
    }
    if (canHover) {
      zone.on("pointerover", (pointer) => {
        this._hoveredActionIndex = index;
        this.layout();
        this.showActionTooltip(index, pointer);
      });
      zone.on("pointermove", (pointer) => this.moveActionTooltip(pointer));
      zone.on("pointerout", () => {
        this._hoveredActionIndex = -1;
        this.layout();
        this.hideActionTooltip();
      });
    }
  }

  hasActionTooltip(slot) {
    return Boolean(
      slot && (slot.tooltipTitle || slot.tooltipDescription || slot.tooltipCost != null || slot.tooltipWarning),
    );
  }

  showActionTooltip(index, pointer) {
    const slot = this._actionSlotConfigs[index];
    if (!this._bottomVisible || !this.hasActionTooltip(slot)) {
      this.hideActionTooltip();
      return;
    }
    this._hoveredActionIndex = index;
    const title = slot.tooltipTitle || slot.label || "Action";
    const description = slot.tooltipDescription || "";
    const hasCost = slot.tooltipCost != null;
    const resource = slot.tooltipResource || "gold";
    const warning = slot.tooltipWarning || "";
    const costText = hasCost ? `Cost: ${slot.tooltipCost} ${resource}` : "Cost: Free";

    this.tooltipTitleText.setText(title);
    this.tooltipDescriptionText.setText(description);
    this.tooltipCostText.setText(costText);
    this.tooltipWarningText.setText(warning);

    const textPad = 10;
    const lineGap = 4;
    this.tooltipTitleText.setPosition(textPad, textPad);
    this.tooltipDescriptionText.setPosition(textPad, this.tooltipTitleText.y + this.tooltipTitleText.height + lineGap);
    this.tooltipCostText.setPosition(textPad, this.tooltipDescriptionText.y + this.tooltipDescriptionText.height + lineGap);
    this.tooltipWarningText.setPosition(textPad, this.tooltipCostText.y + this.tooltipCostText.height + lineGap);
    this.tooltipWarningText.setVisible(warning.length > 0);

    const tooltipInnerWidth = Math.max(
      this.tooltipTitleText.width,
      this.tooltipDescriptionText.width,
      this.tooltipCostText.width,
      this.tooltipWarningText.visible ? this.tooltipWarningText.width : 0,
      280,
    );
    const tooltipW = tooltipInnerWidth + textPad * 2;
    const warningHeight = this.tooltipWarningText.visible ? this.tooltipWarningText.height + lineGap : 0;
    const tooltipH =
      textPad +
      this.tooltipTitleText.height +
      lineGap +
      this.tooltipDescriptionText.height +
      lineGap +
      this.tooltipCostText.height +
      warningHeight +
      textPad;
    this.tooltipBackground.setSize(tooltipW, tooltipH);
    this.tooltipRoot.setVisible(true);
    this.moveActionTooltip(pointer);
  }

  moveActionTooltip(pointer) {
    if (!this.tooltipRoot.visible) {
      return;
    }
    if (pointer) {
      this._tooltipAnchor.x = pointer.x;
      this._tooltipAnchor.y = pointer.y;
    }
    const rootScale = Number.isFinite(this.rootScale) && this.rootScale > 0 ? this.rootScale : 1;
    const rootWidth = this.scene.scale.width / rootScale;
    const rootHeight = this.scene.scale.height / rootScale;
    const localX = (this._tooltipAnchor.x - this.rootOffsetX) / rootScale;
    const localY = (this._tooltipAnchor.y - this.rootOffsetY) / rootScale;
    const offsetX = 16;
    const offsetY = 20;
    const maxX = Math.max(4, rootWidth - this.tooltipBackground.width - 4);
    const maxY = Math.max(4, rootHeight - this.tooltipBackground.height - 4);
    const x = this.clamp(localX + offsetX, 4, maxX);
    const y = this.clamp(localY + offsetY, 4, maxY);
    this.tooltipRoot.setPosition(x, y);
  }

  hideActionTooltip() {
    this._hoveredActionIndex = -1;
    this.tooltipRoot.setVisible(false);
  }

  createButton(label, interactive, onClick = null, useHoverBackground = true) {
    const button = this.scene.add.text(0, 0, label, {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: interactive ? "#2f4f7f" : "#333333",
      padding: { x: 10, y: 6 },
    });
    button.setOrigin(0, 0.5);

    if (interactive) {
      button.setInteractive({ useHandCursor: true });
      if (typeof onClick === "function") {
        button.on("pointerdown", () => onClick());
      }
      if (useHoverBackground) {
        button.on("pointerover", () => button.setStyle({ backgroundColor: "#3a669f" }));
        button.on("pointerout", () => button.setStyle({ backgroundColor: "#2f4f7f" }));
      }
    }

    return button;
  }

  woodTableFrameIndex(column, row) {
    return (row - 1) * 7 + (column - 1);
  }

  createActionSlotBackground() {
    const container = this.scene.add.container(0, 0);

    const rows = [1, 2, 4, 6, 7];
    const cols = [1, 2, 4, 4, 6, 7];
    const tileSize = 64;
    const textureKey = "woodTablePixelMap";
    const hasTexture = this.scene.textures.exists(textureKey);
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < cols.length; x += 1) {
        const px = x * tileSize;
        const py = y * tileSize;
        if (hasTexture) {
          const frame = this.woodTableFrameIndex(cols[x], rows[y]);
          const tile = this.scene.add.image(px, py, textureKey, frame);
          tile.setOrigin(0, 0);
          container.add(tile);
        } else {
          const fallback = this.scene.add.rectangle(px, py, tileSize, tileSize, 0x243549, 1);
          fallback.setOrigin(0, 0);
          container.add(fallback);
        }
      }
    }
    return container;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  layout(width = this.scene.scale.width, height = this.scene.scale.height) {
    try {
      this.applyVisibilityState();
      const rootScale = Number.isFinite(this.rootScale) && this.rootScale > 0 ? this.rootScale : 1;
      this.root.setScale(rootScale);
      this.root.setPosition(this.rootOffsetX, this.rootOffsetY);
      const rootWidth = width / rootScale;
      const rootHeight = height / rootScale;
      const topHeight = this.clamp(Math.round(rootHeight * 0.072), 48, 96);
      const maxBottom = Math.max(150, rootHeight - topHeight - 96);
      const bottomHeight = this.clamp(Math.round(rootHeight * 0.22), 170, maxBottom);
      this.topBarHeight = topHeight;
      this.bottomBarHeight = bottomHeight;

      const statFontSize = this.clamp(Math.round(topHeight * 0.36), 16, 24);
      const buttonFontSize = this.clamp(Math.round(topHeight * 0.3), 14, 20);
      this.menuButton.setStyle({ fontSize: `${buttonFontSize}px`, padding: { x: 10, y: 6 } });
      this.speedButton.setStyle({ fontSize: `${buttonFontSize}px`, padding: { x: 10, y: 6 } });
      this.hpText.setStyle({ fontSize: `${statFontSize}px` });
      this.goldText.setStyle({ fontSize: `${statFontSize}px` });
      this.towersText.setStyle({ fontSize: `${statFontSize}px` });

      const selectedTitleSize = this.clamp(Math.round(bottomHeight * 0.14), 16, 24);
      const selectedInfoSize = this.clamp(Math.round(bottomHeight * 0.1), 14, 20);
      this.selectedTitleText.setStyle({ fontSize: `${selectedTitleSize}px` });
      this.selectedHpText.setStyle({ fontSize: `${selectedInfoSize}px` });
      this.selectedCellText.setStyle({ fontSize: `${selectedInfoSize}px` });
      this.selectedDamageText.setStyle({ fontSize: `${selectedInfoSize}px` });
      this.selectedRangeText.setStyle({ fontSize: `${selectedInfoSize}px` });

      this.topBackground.setSize(rootWidth, this.topBarHeight);
      this.topBackground.setPosition(0, 0);
      const activeBottomHeight = this._bottomVisible ? this.bottomBarHeight : 0;
      this.bottomBackground.setSize(rootWidth, activeBottomHeight);
      this.bottomBackground.setPosition(0, Math.max(0, rootHeight - activeBottomHeight));

      const centerY = this.topBarHeight / 2;
      const leftPadding = 10;
      this.menuButton.setPosition(leftPadding, centerY);
      const speedGap = 10;
      this.speedButton.setPosition(this.menuButton.x + this.menuButton.width + speedGap, centerY);

      const menuPad = 8;
      this.menuBackdrop.setPosition(0, this.topBarHeight);
      this.menuBackdrop.setSize(rootWidth, Math.max(0, rootHeight - this.topBarHeight));

      const dropY = this.menuButton.y + Math.round(this.menuButton.height * 0.5) + menuPad;
      this.menuDropdownRoot.setPosition(this.menuButton.x, dropY);
      const menuWidth = this.clamp(Math.round(rootWidth * 0.25), 300, 420);
      const menuHeight = this.clamp(Math.round(this.topBarHeight * 2.8), 130, 200);
      const menuItemFontSize = this.clamp(Math.round(this.topBarHeight * 0.42), 18, 30);
      const menuItemPadX = this.clamp(Math.round(menuWidth * 0.05), 12, 20);
      const menuItemPadY = this.clamp(Math.round(this.topBarHeight * 0.22), 8, 14);
      this.menuDropdownBg.setSize(menuWidth, menuHeight);
      this.menuBtnMapEditor.setStyle({ fontSize: `${menuItemFontSize}px`, padding: { x: menuItemPadX, y: menuItemPadY } });
      this.menuBtnKeybindings.setStyle({ fontSize: `${menuItemFontSize}px`, padding: { x: menuItemPadX, y: menuItemPadY } });
      this.menuBtnMapEditor.setPosition(14, Math.round(menuHeight * 0.28));
      this.menuBtnKeybindings.setPosition(14, Math.round(menuHeight * 0.72));

      this.keybindBackdrop.setPosition(0, 0);
      this.keybindBackdrop.setSize(rootWidth, rootHeight);
      this.keybindPanelInner.setPosition(rootWidth / 2, rootHeight / 2);
      const keybindPanelW = this.clamp(Math.round(rootWidth * 0.72), 680, 980);
      const keybindPanelH = this.clamp(Math.round(rootHeight * 0.55), 420, 620);
      const keybindTitleSize = this.clamp(Math.round(keybindPanelH * 0.08), 24, 40);
      this.keybindPanelBg.setSize(keybindPanelW, keybindPanelH);
      this.keybindTitle.setStyle({ fontSize: `${keybindTitleSize}px` });
      this.keybindTitle.setPosition(0, -this.keybindPanelBg.height * 0.5 + 22);
      const footerY = this.keybindPanelBg.height * 0.5 - 28;
      const rowStartY = this.keybindTitle.y + Math.round(keybindPanelH * 0.1);
      const rowCount = Math.max(1, this._keybindRowButtons.length);
      const rowAvailable = Math.max(60, footerY - 28 - rowStartY);
      const rowStep = Math.max(22, Math.floor(rowAvailable / rowCount));
      const keybindRowSize = this.clamp(Math.round(rowStep * 0.42), 13, 24);
      let rowY = rowStartY;
      for (const { button } of this._keybindRowButtons) {
        button.setStyle({ fontSize: `${keybindRowSize}px`, padding: { x: 12, y: 6 } });
        button.setPosition(-this.keybindPanelBg.width * 0.5 + 16, rowY);
        rowY += rowStep;
      }
      const footerSize = this.clamp(Math.round(keybindPanelH * 0.05), 18, 28);
      this.keybindBackBtn.setStyle({ fontSize: `${footerSize}px`, padding: { x: 16, y: 10 } });
      this.keybindResetBtn.setStyle({ fontSize: `${footerSize}px`, padding: { x: 16, y: 10 } });
      this.keybindBackBtn.setPosition(-this.keybindPanelBg.width * 0.5 + 16, footerY);
      this.keybindResetBtn.setPosition(this.keybindPanelBg.width * 0.5 - this.keybindResetBtn.width - 16, footerY);

      const rightPadding = 12;
      const statGap = 20;
      this.towersText.setPosition(rootWidth - rightPadding, centerY);
      this.goldText.setPosition(this.towersText.x - this.towersText.width - statGap, centerY);
      this.hpText.setPosition(this.goldText.x - this.goldText.width - statGap, centerY);

      const bottomY = Math.max(0, rootHeight - activeBottomHeight);
      let panelPadding = this.clamp(Math.round(rootWidth * 0.015), 8, 14);
      const compactBottom = rootWidth < 760 || this.bottomBarHeight < 190;
      if (compactBottom) {
        panelPadding = Math.max(6, panelPadding - 2);
      }

      const minimapW = this.clamp(Math.round(rootWidth * 0.2), compactBottom ? 96 : 120, 220);
      const minimapH = this.clamp(
        Math.round(this.bottomBarHeight * (compactBottom ? 0.5 : 0.6)),
        compactBottom ? 78 : 90,
        Math.max(compactBottom ? 78 : 90, this.bottomBarHeight - panelPadding * 2),
      );
      this.minimapFrame.setSize(minimapW, minimapH);
      this.minimapFrame.setPosition(panelPadding, bottomY + panelPadding);

      let selectionGap = compactBottom ? 10 : 18;
      let selectionX = this.minimapFrame.x + this.minimapFrame.width + selectionGap;
      this.selectedTitleText.setPosition(selectionX, bottomY + panelPadding + selectedTitleSize * 0.8);
      this.selectedHpText.setPosition(selectionX, this.selectedTitleText.y + selectedInfoSize * 1.7);
      this.selectedCellText.setPosition(selectionX, this.selectedHpText.y + selectedInfoSize * 1.5);
      this.selectedDamageText.setPosition(selectionX, this.selectedCellText.y + selectedInfoSize * 1.5);
      this.selectedRangeText.setPosition(selectionX, this.selectedDamageText.y + selectedInfoSize * 1.5);

      const gridCols = 4;
      const frameW = 384;
      const frameH = 320;
      const contentCellW = 64;
      const contentCellH = 64;
      const contentPadX = 64; 
      const contentPadY = 64;
      const actionFontSize = 16;
      const actionScale = Number.isFinite(this.actionPanelScale) && this.actionPanelScale > 0
        ? this.actionPanelScale
        : 1;
      const scaledFrameW = frameW * actionScale;
      const scaledFrameH = frameH * actionScale;
      const marginX = Math.max(0, this.actionPanelMarginX);
      const marginY = Math.max(0, this.actionPanelMarginY);
      let gridStartX = rootWidth - marginX - scaledFrameW;
      let gridStartY = rootHeight - marginY - scaledFrameH;
      if (this.actionPanelCorner === "bottom-left") {
        gridStartX = marginX;
        gridStartY = rootHeight - marginY - scaledFrameH;
      } else if (this.actionPanelCorner === "top-right") {
        gridStartX = rootWidth - marginX - scaledFrameW;
        gridStartY = Math.max(0, this.topBarHeight + marginY);
      } else if (this.actionPanelCorner === "top-left") {
        gridStartX = marginX;
        gridStartY = Math.max(0, this.topBarHeight + marginY);
      }

      this._actionGridBackground.setPosition(gridStartX + this.actionPanelOffsetX, gridStartY + this.actionPanelOffsetY);
      this._actionGridBackground.setScale(actionScale);

      for (let i = 0; i < this._actionButtons.length; i += 1) {
        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const x = contentPadX + col * contentCellW + contentCellW / 2;
        const y = contentPadY + row * contentCellH + contentCellH / 2;
        const slot = this._actionSlotConfigs[i];
        const icon = this._actionIcons[i];
        
        const textureExists = slot?.iconKey ? this.scene.textures.exists(slot.iconKey) : false;

        if (slot?.iconKey && textureExists) {
          if (!icon || icon.texture.key !== slot.iconKey) {
            icon?.destroy();
            const nextIcon = this.scene.add.image(0, 0, slot.iconKey); // Create at local 0,0
            nextIcon.setOrigin(0.5, 0.5);
            this._actionGridBackground.add(nextIcon);
            this._actionIcons[i] = nextIcon;
          }
        } else if (icon) {
          icon.destroy();
          this._actionIcons[i] = null;
        }

        const currentIcon = this._actionIcons[i];
        const iconSize = Math.round(Math.min(contentCellW, contentCellH) * 0.75);
        if (currentIcon) {
          const offsetX = slot?.iconOffsetX ?? 0;
          const offsetY = slot?.iconOffsetY ?? 0;
          currentIcon
            .setVisible(Boolean(slot))
            .setPosition(x + offsetX, y + offsetY)
            .setDisplaySize(iconSize, iconSize);
        }

        const button = this._actionButtons[i];
        const hitZone = this._actionHitZones[i];
        hitZone
          .setPosition(x, y)
          .setSize(contentCellW, contentCellH)
          .setVisible(Boolean(slot));

        const showInlineLabel = Boolean(slot?.label) && this._hoveredActionIndex === i && !this.hasActionTooltip(slot);
        button
          .setPosition(x, y)
          .setVisible(Boolean(slot))
          .setText(showInlineLabel ? slot.label : "")
          .setStyle({ fontSize: `${actionFontSize}px`, padding: { x: 6, y: 5 } });

        if (currentIcon && showInlineLabel) {
          button.setOrigin(1, 0.5);
          button.setX(x - (iconSize / 2) - 8);
          button.setStyle({ fontSize: `13px`, color: "#ffffff", stroke: "#000000", strokeThickness: 3 });
        } else {
          button.setOrigin(0.5, 0.5);
        }
      }
      for (const z of this._actionHitZones) {
        this._actionGridBackground.bringToTop(z);
      }
      if (this.tooltipRoot.visible) {
        this.moveActionTooltip();
      }
      this.renderMinimap();
    } catch (e) {
      console.error("[HUD] Layout error:", e);
    }
  }

  applyVisibilityState() {
    for (const obj of this.topUiObjects) {
      obj.setVisible(this._topVisible);
    }
    this.applyMenuOverlayVisibility();
    for (const obj of this.bottomUiObjects) {
      obj.setVisible(this._bottomVisible);
    }
    if (!this._bottomVisible) {
      this.hideActionTooltip();
    }
    for (let idx = 0; idx < this._actionHitZones.length; idx += 1) {
      const zone = this._actionHitZones[idx];
      const slot = this._actionSlotConfigs[idx];
      const wantsInput = Boolean(
        this._bottomVisible &&
        slot &&
        ((slot?.enabled && typeof slot?.onClick === "function") || this.hasActionTooltip(slot)),
      );
      if (wantsInput) {
        const canClick = Boolean(slot.enabled && typeof slot.onClick === "function");
        zone.setInteractive({ useHandCursor: canClick });
      } else {
        zone.disableInteractive();
      }
    }
  }

  setBottomVisible(visible) {
    this._bottomVisible = Boolean(visible);
    this.layout();
  }

  setTopVisible(visible) {
    this._topVisible = Boolean(visible);
    this.layout();
  }

  setUiTransform({ x = this.rootOffsetX, y = this.rootOffsetY, scale = this.rootScale } = {}) {
    this.rootOffsetX = Number.isFinite(x) ? x : this.rootOffsetX;
    this.rootOffsetY = Number.isFinite(y) ? y : this.rootOffsetY;
    this.rootScale = Number.isFinite(scale) ? Math.max(0.2, scale) : this.rootScale;
    this.layout();
  }

  setActionPanelTransform({
    scale = this.actionPanelScale,
    corner = this.actionPanelCorner,
    marginX = this.actionPanelMarginX,
    marginY = this.actionPanelMarginY,
  } = {}) {
    if (Number.isFinite(scale)) {
      this.actionPanelScale = Math.max(0.5, scale);
    }
    if (typeof corner === "string") {
      const normalizedCorner = corner.toLowerCase();
      const validCorner = [
        "bottom-right",
        "bottom-left",
        "top-right",
        "top-left",
      ].includes(normalizedCorner);
      if (validCorner) {
        this.actionPanelCorner = normalizedCorner;
      }
    }
    if (Number.isFinite(marginX)) {
      this.actionPanelMarginX = Math.max(0, marginX);
    }
    if (Number.isFinite(marginY)) {
      this.actionPanelMarginY = Math.max(0, marginY);
    }
    this.layout();
  }

  getUiObjects() {
    return [this.root];
  }

  getOcclusionMargins() {
    return {
      top: this._topVisible ? this.topBarHeight : 0,
      bottom: this._bottomVisible ? this.bottomBarHeight : 0,
      left: 0,
      right: 0,
    };
  }

  render(state, towerCount = 0, maxLives = this.maxLives, selectedBuilding = null, minimapData = null) {
    this._selectedBuilding = selectedBuilding;
    this._minimapData = minimapData;
    const rawSpeed = Number(state.gameSpeed);
    const gameSpeed =
      Number.isFinite(rawSpeed) ? Math.max(1, Math.min(3, Math.round(rawSpeed))) : 1;
    this.speedButton.setText(`Speed x${gameSpeed}`);
    const hpMax = typeof maxLives === "number" && maxLives > 0 ? maxLives : state.lives;
    this.hpText.setText(`HP: ${state.lives}/${hpMax}`);
    this.goldText.setText(`Gold: ${state.gold}`);
    this.towersText.setText(`Towers: ${towerCount}`);
    this.updateSelectionText();
    this.layout();
  }

  updateSelectionText() {
    const selected = this._selectedBuilding;
    if (!selected) {
      this.selectedTitleText.setText("Selected: None");
      this.selectedHpText.setText("HP: N/A");
      this.selectedCellText.setText("Cell: -");
      this.selectedDamageText.setVisible(false);
      this.selectedRangeText.setVisible(false);
      return;
    }
    this.selectedTitleText.setText(`Selected: ${selected.label}`);
    if (typeof selected.hpCurrent === "number" && typeof selected.hpMax === "number") {
      this.selectedHpText.setText(`HP: ${selected.hpCurrent}/${selected.hpMax}`);
    } else {
      this.selectedHpText.setText("HP: N/A");
    }
    this.selectedCellText.setText(`Cell: ${selected.cellX},${selected.cellY}`);
    if (selected.kind === "tower") {
      const damageValue = Number.isFinite(selected.damage) ? Math.round(selected.damage * 10) / 10 : null;
      const rangeValue = Number.isFinite(selected.range) ? Math.round(selected.range) : null;
      this.selectedDamageText.setText(`Damage: ${damageValue ?? "-"}`);
      this.selectedRangeText.setText(`Range: ${rangeValue ?? "-"}`);
      this.selectedDamageText.setVisible(true);
      this.selectedRangeText.setVisible(true);
      return;
    }
    this.selectedDamageText.setVisible(false);
    this.selectedRangeText.setVisible(false);
  }

  renderMinimap() {
    const gfx = this.minimapGraphics;
    gfx.clear();
    if (!this._bottomVisible) {
      return;
    }
    const data = this._minimapData;
    if (!data) {
      return;
    }

    const frameX = this.minimapFrame.x;
    const frameY = this.minimapFrame.y;
    const frameW = this.minimapFrame.width;
    const frameH = this.minimapFrame.height;
    const mapW = Math.max(1, data.mapWidth);
    const mapH = Math.max(1, data.mapHeight);
    const scale = Math.min(frameW / mapW, frameH / mapH);
    const drawW = mapW * scale;
    const drawH = mapH * scale;
    const offX = frameX + (frameW - drawW) / 2;
    const offY = frameY + (frameH - drawH) / 2;

    gfx.fillStyle(0x233a57, 0.85);
    gfx.fillRect(offX, offY, drawW, drawH);
    gfx.lineStyle(1, 0xa6caf0, 0.9);
    gfx.strokeRect(offX, offY, drawW, drawH);

    gfx.fillStyle(0x58a6ff, 1);
    for (const tower of data.towers) {
      gfx.fillRect(offX + tower.x * scale - 1, offY + tower.y * scale - 1, 3, 3);
    }

    gfx.fillStyle(0x4de06f, 1);
    for (const barracks of data.friendlyBarracks) {
      gfx.fillRect(offX + barracks.x * scale - 2, offY + barracks.y * scale - 2, 5, 5);
    }
    gfx.fillStyle(0xff6f6f, 1);
    for (const barracks of data.enemyBarracks) {
      gfx.fillRect(offX + barracks.x * scale - 2, offY + barracks.y * scale - 2, 5, 5);
    }

    const viewport = data.viewport;
    const vx = offX + viewport.x * scale;
    const vy = offY + viewport.y * scale;
    const vw = viewport.width * scale;
    const vh = viewport.height * scale;
    gfx.lineStyle(1, 0xffec88, 1);
    gfx.strokeRect(vx, vy, vw, vh);
  }
}
