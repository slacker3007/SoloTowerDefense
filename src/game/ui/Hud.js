export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onMenuClick?: () => void, maxLives?: number }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.onMenuClick = typeof options.onMenuClick === "function" ? options.onMenuClick : () => {};
    this.maxLives = typeof options.maxLives === "number" ? options.maxLives : 0;

    this.topBarHeight = 48;
    this.bottomBarHeight = 220;
    this.depth = 100;
    this.rootOffsetX = 0;
    this.rootOffsetY = 0;
    this.rootScale = 1;
    this.actionPanelScale = 1.25;
    this.actionPanelCorner = "bottom-right";
    this.actionPanelMarginX = 16;
    this.actionPanelMarginY = 16;
    this._selectedBuilding = null;
    this._minimapData = null;
    this._actionButtons = [];
    this._actionGridBackground = null;
    this._actionIcons = [];
    this._actionSlotConfigs = Array.from({ length: 12 }, () => null);
    this._topVisible = true;
    this._bottomVisible = true;
    this.root = scene.add.container(0, 0);
    this.root.setDepth(this.depth);
    this.root.setScrollFactor(0);

    this.topBackground = scene.add.rectangle(0, 0, scene.scale.width, this.topBarHeight, 0x000000, 0.72);
    this.topBackground.setOrigin(0, 0);

    this.bottomBackground = scene.add.rectangle(0, 0, scene.scale.width, this.bottomBarHeight, 0x000000, 0.82);
    this.bottomBackground.setOrigin(0, 0);

    this.menuButton = this.createButton("Menu", true);

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

    for (let i = 0; i < 12; i += 1) {
      const button = this.createButton("", true, null, false);
      button.setOrigin(0.5, 0.5);
      button.setStyle({ backgroundColor: "#00000000" });
      this._actionGridBackground.add(button);
      this._actionButtons.push(button);
      this._actionIcons.push(null);
    }

    this.root.add([
      this.topBackground,
      this.bottomBackground,
      this.menuButton,
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
    ]);

    this.topUiObjects = [this.topBackground, this.menuButton, this.hpText, this.goldText, this.towersText];
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

  setActionSlots(slots = []) {
    for (let i = 0; i < this._actionSlotConfigs.length; i += 1) {
      this._actionSlotConfigs[i] = slots[i] ?? null;
      this.updateActionSlotInteractivity(i);
    }
    this.layout();
  }

  updateActionSlotInteractivity(index) {
    const button = this._actionButtons[index];
    const slot = this._actionSlotConfigs[index];
    button.removeAllListeners("pointerdown");
    if (!slot || !slot.enabled || typeof slot.onClick !== "function") {
      button.disableInteractive();
      return;
    }
    button.setInteractive({ useHandCursor: true });
    button.on("pointerdown", () => slot.onClick());
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

      this._actionGridBackground.setPosition(gridStartX, gridStartY);
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
        button
          .setPosition(x, y)
          .setVisible(Boolean(slot))
          .setText(slot?.label ?? "")
          .setStyle({ fontSize: `${actionFontSize}px`, padding: { x: 6, y: 5 } });

        if (currentIcon && slot?.label) {
          button.setOrigin(1, 0.5);
          button.setX(x - (iconSize / 2) - 8);
          button.setStyle({ fontSize: `13px`, color: "#ffffff", stroke: "#000000", strokeThickness: 3 });
        } else {
          button.setOrigin(0.5, 0.5);
        }
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
    for (const obj of this.bottomUiObjects) {
      obj.setVisible(this._bottomVisible);
    }
    for (const button of this._actionButtons) {
      if (button.input) {
        const idx = this._actionButtons.indexOf(button);
        const slot = this._actionSlotConfigs[idx];
        const enabled = Boolean(this._bottomVisible && slot?.enabled && typeof slot?.onClick === "function");
        if (enabled) {
          button.setInteractive({ useHandCursor: true });
        } else {
          button.disableInteractive();
        }
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
