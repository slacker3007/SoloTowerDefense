export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onMenuClick?: () => void, maxLives?: number }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.onMenuClick = typeof options.onMenuClick === "function" ? options.onMenuClick : () => {};
    this.onBuildClick = typeof options.onBuildClick === "function" ? options.onBuildClick : () => {};
    this.maxLives = typeof options.maxLives === "number" ? options.maxLives : 0;

    this.topBarHeight = 48;
    this.bottomBarHeight = 220;
    this.depth = 100;
    this._selectedBuilding = null;
    this._minimapData = null;
    this._actionButtons = [];
    this._topVisible = true;
    this._bottomVisible = true;

    this.topBackground = scene.add.rectangle(0, 0, scene.scale.width, this.topBarHeight, 0x000000, 0.72);
    this.topBackground.setOrigin(0, 0);
    this.topBackground.setDepth(this.depth);
    this.topBackground.setScrollFactor(0);

    this.bottomBackground = scene.add.rectangle(0, 0, scene.scale.width, this.bottomBarHeight, 0x000000, 0.82);
    this.bottomBackground.setOrigin(0, 0);
    this.bottomBackground.setDepth(this.depth);
    this.bottomBackground.setScrollFactor(0);

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

    for (const text of [this.hpText, this.goldText, this.towersText, this.selectedTitleText, this.selectedHpText, this.selectedCellText]) {
      text.setDepth(this.depth + 1);
      text.setScrollFactor(0);
      text.setOrigin(0, 0.5);
    }

    this.hpText.setOrigin(1, 0.5);
    this.goldText.setOrigin(1, 0.5);
    this.towersText.setOrigin(1, 0.5);

    this.minimapFrame = scene.add.rectangle(0, 0, 180, 120, 0x152235, 0.95);
    this.minimapFrame.setOrigin(0, 0);
    this.minimapFrame.setDepth(this.depth + 1);
    this.minimapFrame.setScrollFactor(0);
    this.minimapFrame.setStrokeStyle(2, 0x7ca8d6, 0.9);

    this.minimapGraphics = scene.add.graphics();
    this.minimapGraphics.setDepth(this.depth + 2);
    this.minimapGraphics.setScrollFactor(0);

    for (let i = 0; i < 12; i += 1) {
      const label = i === 0 ? "Build" : `---`;
      const button = this.createButton(label, i === 0, i === 0 ? this.onBuildClick : null);
      this._actionButtons.push(button);
    }

    this.topUiObjects = [this.topBackground, this.menuButton, this.hpText, this.goldText, this.towersText];
    this.bottomUiObjects = [
      this.bottomBackground,
      this.minimapFrame,
      this.minimapGraphics,
      this.selectedTitleText,
      this.selectedHpText,
      this.selectedCellText,
      ...this._actionButtons,
    ];
    this.uiObjects = [
      this.topBackground,
      this.menuButton,
      this.hpText,
      this.goldText,
      this.towersText,
      ...this.bottomUiObjects,
    ];
    this.layout(scene.scale.width, scene.scale.height);
    this.scene.scale.on("resize", this.handleResize, this);
  }

  createButton(label, interactive, onClick = null) {
    const button = this.scene.add.text(0, 0, label, {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: interactive ? "#2f4f7f" : "#333333",
      padding: { x: 10, y: 6 },
    });
    button.setDepth(this.depth + 1);
    button.setScrollFactor(0);
    button.setOrigin(0, 0.5);

    if (interactive) {
      button.setInteractive({ useHandCursor: true });
      if (typeof onClick === "function") {
        button.on("pointerdown", () => onClick());
      }
      button.on("pointerover", () => button.setStyle({ backgroundColor: "#3a669f" }));
      button.on("pointerout", () => button.setStyle({ backgroundColor: "#2f4f7f" }));
    }

    return button;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  handleResize(gameSize) {
    this.layout(gameSize.width, gameSize.height);
  }

  layout(width, height) {
    this.applyVisibilityState();
    const topHeight = this.clamp(Math.round(height * 0.072), 48, 96);
    const maxBottom = Math.max(150, height - topHeight - 96);
    const bottomHeight = this.clamp(Math.round(height * 0.22), 170, maxBottom);
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

    this.topBackground.setSize(width, this.topBarHeight);
    this.topBackground.setPosition(0, 0);
    const activeBottomHeight = this._bottomVisible ? this.bottomBarHeight : 0;
    this.bottomBackground.setSize(width, activeBottomHeight);
    this.bottomBackground.setPosition(0, Math.max(0, height - activeBottomHeight));

    const centerY = this.topBarHeight / 2;
    const leftPadding = 10;
    this.menuButton.setPosition(leftPadding, centerY);

    const rightPadding = 12;
    const statGap = 20;
    this.towersText.setPosition(width - rightPadding, centerY);
    this.goldText.setPosition(this.towersText.x - this.towersText.width - statGap, centerY);
    this.hpText.setPosition(this.goldText.x - this.goldText.width - statGap, centerY);

    const bottomY = Math.max(0, height - activeBottomHeight);
    const panelPadding = 14;
    const minimapW = this.clamp(Math.round(width * 0.2), 120, 220);
    const minimapH = this.clamp(Math.round(this.bottomBarHeight * 0.6), 90, Math.max(90, this.bottomBarHeight - panelPadding * 2));
    this.minimapFrame.setSize(minimapW, minimapH);
    this.minimapFrame.setPosition(panelPadding, bottomY + panelPadding);

    const selectionX = this.minimapFrame.x + this.minimapFrame.width + 18;
    this.selectedTitleText.setPosition(selectionX, bottomY + panelPadding + selectedTitleSize * 0.8);
    this.selectedHpText.setPosition(selectionX, this.selectedTitleText.y + selectedInfoSize * 1.7);
    this.selectedCellText.setPosition(selectionX, this.selectedHpText.y + selectedInfoSize * 1.5);

    const gridCols = 4;
    let gridCellW = this.clamp(Math.round(width * 0.085), 58, 96);
    const gridCellH = this.clamp(Math.round(this.bottomBarHeight * 0.17), 34, 52);
    let gridGapX = this.clamp(Math.round(gridCellW * 0.1), 4, 10);
    const gridGapY = this.clamp(Math.round(gridCellH * 0.18), 5, 10);
    const maxGridWidth = Math.max(220, width - panelPadding * 2);
    const requiredGridWidth = gridCols * gridCellW + (gridCols - 1) * gridGapX;
    if (requiredGridWidth > maxGridWidth) {
      gridCellW = Math.max(52, Math.floor((maxGridWidth - (gridCols - 1) * gridGapX) / gridCols));
      gridGapX = this.clamp(Math.round(gridCellW * 0.08), 3, 8);
    }
    const actionFontSize = this.clamp(Math.round(gridCellH * 0.38), 12, 16);
    const gridStartX = width - panelPadding - gridCols * gridCellW - (gridCols - 1) * gridGapX;
    const gridStartY = bottomY + panelPadding;
    for (let i = 0; i < this._actionButtons.length; i += 1) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const x = gridStartX + col * (gridCellW + gridGapX);
      const y = gridStartY + row * (gridCellH + gridGapY) + gridCellH / 2;
      this._actionButtons[i]
        .setPosition(x, y)
        .setStyle({
        fontSize: `${actionFontSize}px`,
        padding: {
          x: this.clamp(Math.round(gridCellW * 0.12), 6, 12),
          y: this.clamp(Math.round(gridCellH * 0.15), 4, 8),
        },
      });
    }
    this.renderMinimap();
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
        if (this._bottomVisible) {
          button.setInteractive({ useHandCursor: true });
        } else {
          button.disableInteractive();
        }
      }
    }
  }

  setBottomVisible(visible) {
    this._bottomVisible = Boolean(visible);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  setTopVisible(visible) {
    this._topVisible = Boolean(visible);
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  getUiObjects() {
    return this.uiObjects;
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
    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  updateSelectionText() {
    const selected = this._selectedBuilding;
    if (!selected) {
      this.selectedTitleText.setText("Selected: None");
      this.selectedHpText.setText("HP: N/A");
      this.selectedCellText.setText("Cell: -");
      return;
    }
    this.selectedTitleText.setText(`Selected: ${selected.label}`);
    if (typeof selected.hpCurrent === "number" && typeof selected.hpMax === "number") {
      this.selectedHpText.setText(`HP: ${selected.hpCurrent}/${selected.hpMax}`);
    } else {
      this.selectedHpText.setText("HP: N/A");
    }
    this.selectedCellText.setText(`Cell: ${selected.cellX},${selected.cellY}`);
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
