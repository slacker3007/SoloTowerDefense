import Phaser from "phaser";
import { getTowerRoleHudModel } from "../balance";
import {
  KEYBIND_ACTION_IDS,
  KEYBIND_DESCRIPTIONS,
  formatKeyLabel,
  isModifierOnlyEvent,
  keyCodeFromBrowserEvent,
} from "../input/KeybindStore.js";
import { cozyTheme } from "./CozyTheme";

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   maxLives?: number,
   *   keybindStore?: import("../input/KeybindStore.js").KeybindStore | null,
   *   onMapEditorFromMenu?: () => void,
   *   onOpenSettings?: () => void,
   *   onMainMenu?: () => void,
   *   onKeybindsChanged?: () => void,
   *   onCycleGameSpeed?: () => void,
  *   onTogglePause?: () => void,
   * }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.maxLives = typeof options.maxLives === "number" ? options.maxLives : 0;
    /** @type {import("../input/KeybindStore.js").KeybindStore | null} */
    this.keybindStore = options.keybindStore ?? null;
    this.onMapEditorFromMenu = typeof options.onMapEditorFromMenu === "function" ? options.onMapEditorFromMenu : () => {};
    this.onOpenSettings = typeof options.onOpenSettings === "function" ? options.onOpenSettings : () => {};
    this.onMainMenu = typeof options.onMainMenu === "function" ? options.onMainMenu : () => {};
    this.onKeybindsChanged = typeof options.onKeybindsChanged === "function" ? options.onKeybindsChanged : () => {};
    this.onCycleGameSpeed = typeof options.onCycleGameSpeed === "function" ? options.onCycleGameSpeed : () => {};
    this.onTogglePause = typeof options.onTogglePause === "function" ? options.onTogglePause : () => {};

    this._menuDropdownOpen = false;
    this._keybindPanelOpen = false;
    /** @type {string | null} */
    this._rebindingActionId = null;
    /** @type {((ev: KeyboardEvent) => void) | null} */
    this._rebindKeyHandler = null;
    this._keybindFeedback = "";

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
    this._waveInfo = null;
    this._towerDpsProminent = false;
    this._actionButtons = [];
    /** @type {Phaser.GameObjects.Zone[]} Full-cell hit targets for action grid slots (64×64 local space). */
    this._actionHitZones = [];
    this._actionGridBackground = null;
    this._actionIcons = [];
    this._actionAccentFrames = [];
    this._actionCostTexts = [];
    this._actionInfoTexts = [];
    this._actionInfoHitZones = [];
    this._actionSlotConfigs = Array.from({ length: 12 }, () => null);
    this._hoveredActionIndex = -1;
    this._tooltipAnchor = { x: 0, y: 0 };
    this._topVisible = true;
    this._bottomVisible = true;
    this._detailsSlotIndex = -1;
    this.root = scene.add.container(0, 0);
    this.root.setDepth(this.depth);
    this.root.setScrollFactor(0);

    this.topBackground = scene.add.rectangle(0, 0, scene.scale.width, this.topBarHeight, 0x251d22, 0.92);
    this.topBackground.setOrigin(0, 0);

    this.bottomBackground = scene.add.rectangle(0, 0, scene.scale.width, this.bottomBarHeight, 0x231b21, 0.94);
    this.bottomBackground.setOrigin(0, 0);

    this.menuButton = this.createButton("Menu", true, () => this.toggleMenuDropdown());
    this.speedButton = this.createButton("Speed x1", true, () => this.onCycleGameSpeed());
    this.pauseButton = this.createButton("Pause", true, () => this.onTogglePause());

    this.menuBackdrop = scene.add.rectangle(0, 0, 800, 600, 0x000011, 0.35);
    this.menuBackdrop.setOrigin(0, 0);
    this.menuBackdrop.setInteractive();
    this.menuBackdrop.on("pointerdown", (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this.closeMenuDropdown();
    });
    this.menuBackdrop.setVisible(false);

    this.menuDropdownBg = scene.add.rectangle(0, 0, 320, 220, 0x2f2630, 0.98);
    this.menuDropdownBg.setOrigin(0, 0);
    this.menuDropdownBg.setStrokeStyle(2, 0xbda67a, 1);

    this.menuBtnMapEditor = this.createButton("Map editor", true, () => {
      this.closeMenuDropdown();
      this.onMapEditorFromMenu();
    });
    this.menuBtnSettings = this.createButton("Settings", true, () => {
      this.closeMenuDropdown();
      this.onOpenSettings();
    });
    this.menuBtnMainMenu = this.createButton("Main menu", true, () => {
      this.closeMenuDropdown();
      this.onMainMenu();
    });

    this.menuDropdownRoot = scene.add.container(0, 0, [
      this.menuDropdownBg,
      this.menuBtnMapEditor,
      this.menuBtnSettings,
      this.menuBtnMainMenu,
    ]);
    this.menuDropdownRoot.setVisible(false);
    this.menuBtnMapEditor.setPosition(14, 30);
    this.menuBtnSettings.setPosition(14, 94);
    this.menuBtnMainMenu.setPosition(14, 158);

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
      this._keybindFeedback = "Reset to defaults.";
      this.refreshKeybindRows();
      this.onKeybindsChanged();
    });
    this.keybindFeedbackText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    });
    this.keybindFeedbackText.setOrigin(0.5, 0);

    this.keybindPanelInner = scene.add.container(0, 0, [
      this.keybindPanelBg,
      this.keybindTitle,
      ...this._keybindRowButtons.map((r) => r.button),
      this.keybindBackBtn,
      this.keybindResetBtn,
      this.keybindFeedbackText,
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
    this.contextPanelFrame = scene.add.rectangle(0, 0, 320, 130, 0x152235, 0.95);
    this.contextPanelFrame.setOrigin(0, 0);
    this.contextPanelFrame.setStrokeStyle(2, 0x7ca8d6, 0.9);
    this.contextTitleText = scene.add.text(0, 0, "Battle Context", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
    });
    this.contextTitleText.setOrigin(0, 0);
    this.contextSubtitleText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#c8d0ff",
    });
    this.contextSubtitleText.setOrigin(0, 0);
    this.waveCountText = scene.add.text(0, 0, "Wave: 1", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });
    this.waveCountText.setOrigin(0, 0);
    this.waveEnemiesText = scene.add.text(0, 0, "Enemies: 0", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#c8d0ff",
    });
    this.waveEnemiesText.setOrigin(0, 0);
    this.upcomingEnemiesTitleText = scene.add.text(0, 0, "Upcoming", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#9ac6f7",
    });
    this.upcomingEnemiesTitleText.setOrigin(0, 0);
    this.upcomingCurrentIconBg = scene.add.rectangle(0, 0, 38, 38, 0x243549, 1);
    this.upcomingCurrentIconBg.setOrigin(0, 0);
    this.upcomingCurrentIconBg.setStrokeStyle(1, 0x6f99c9, 0.8);
    this.upcomingCurrentIcon = scene.add.image(0, 0, "__WHITE");
    this.upcomingCurrentIcon.setVisible(false);
    this.upcomingCurrentIconLabel = scene.add.text(0, 0, "Now", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#d2e4ff",
    });
    this.upcomingCurrentIconLabel.setOrigin(0, 0);
    this.upcomingNextIconBg = scene.add.rectangle(0, 0, 38, 38, 0x243549, 1);
    this.upcomingNextIconBg.setOrigin(0, 0);
    this.upcomingNextIconBg.setStrokeStyle(1, 0x6f99c9, 0.8);
    this.upcomingNextIcon = scene.add.image(0, 0, "__WHITE");
    this.upcomingNextIcon.setVisible(false);
    this.upcomingNextIconLabel = scene.add.text(0, 0, "Next", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#d2e4ff",
    });
    this.upcomingNextIconLabel.setOrigin(0, 0);
    this.towerCardIconBg = scene.add.rectangle(0, 0, 72, 72, 0x243549, 1);
    this.towerCardIconBg.setOrigin(0, 0);
    this.towerCardIconBg.setStrokeStyle(1, 0x6f99c9, 0.8);
    this.towerCardIcon = scene.add.image(0, 0, "__WHITE");
    this.towerCardIcon.setVisible(false);
    this.towerNameTierText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
    });
    this.towerNameTierText.setOrigin(0, 0);
    this.towerRolePrimaryText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#e8f4ff",
    });
    this.towerRolePrimaryText.setOrigin(0, 0);
    this.towerDpsText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#d6e7ff",
    });
    this.towerDpsText.setOrigin(0, 0);
    this.towerRangeText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#d6e7ff",
    });
    this.towerRangeText.setOrigin(0, 0);
    this.towerRangeTrack = scene.add.rectangle(0, 0, 100, 10, 0x22313f, 1);
    this.towerRangeTrack.setOrigin(0, 0);
    this.towerRangeTrack.setStrokeStyle(1, 0x7ca8d6, 0.8);
    this.towerRangeFill = scene.add.rectangle(0, 0, 2, 8, 0x8db8ff, 1);
    this.towerRangeFill.setOrigin(0, 0);
    this.towerEffectText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#9ac6f7",
    });
    this.towerEffectText.setOrigin(0, 0);
    this._contextMode = "wave";

    for (const text of [
      this.hpText,
      this.goldText,
      this.towersText,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentIconLabel,
      this.upcomingNextIconLabel,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerEffectText,
    ]) {
      text.setOrigin(0, 0.5);
    }

    this.hpText.setOrigin(1, 0.5);
    this.goldText.setOrigin(1, 0.5);
    this.towersText.setOrigin(1, 0.5);
    this.contextTitleText.setOrigin(0, 0);
    this.contextSubtitleText.setOrigin(0, 0);
    this.waveCountText.setOrigin(0, 0);
    this.waveEnemiesText.setOrigin(0, 0);
    this.upcomingEnemiesTitleText.setOrigin(0, 0);
    this.upcomingCurrentIconLabel.setOrigin(0, 0);
    this.upcomingNextIconLabel.setOrigin(0, 0);
    this.towerNameTierText.setOrigin(0, 0);
    this.towerRolePrimaryText.setOrigin(0, 0);
    this.towerDpsText.setOrigin(0, 0);
    this.towerRangeText.setOrigin(0, 0);
    this.towerEffectText.setOrigin(0, 0);

    this.waveProgressTrack = scene.add.rectangle(0, 0, 120, 12, 0x22313f, 1);
    this.waveProgressTrack.setOrigin(0, 0);
    this.waveProgressTrack.setStrokeStyle(1, 0x7ca8d6, 0.9);
    this.waveProgressFill = scene.add.rectangle(0, 0, 2, 10, 0x5bbf8a, 1);
    this.waveProgressFill.setOrigin(0, 0);
    this.waveProgressText = scene.add.text(0, 0, "0%", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#b7f7da",
    });
    this.waveProgressText.setOrigin(0, 0);
    this.goldDeltaText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#8df5a6",
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.goldDeltaText.setOrigin(0, 0.5);
    this.goldDeltaText.setVisible(false);
    this._lastGoldValue = null;
    this._goldDeltaTween = null;

    this._actionGridBackground = this.createActionSlotBackground();

    const actionSlotCell = 64;
    for (let i = 0; i < 12; i += 1) {
      const accent = this.scene.add.rectangle(0, 0, actionSlotCell - 8, actionSlotCell - 8, 0x2d3845, 0.65);
      accent.setOrigin(0.5, 0.5);
      accent.setStrokeStyle(2, 0x6f99c9, 0.9);
      this._actionGridBackground.add(accent);
      this._actionAccentFrames.push(accent);

      const button = this.createButton("", false, null, false);
      button.setOrigin(0.5, 0.5);
      button.setStyle({ backgroundColor: "#00000000" });
      this._actionGridBackground.add(button);
      this._actionButtons.push(button);

      const zone = this.scene.add.zone(0, 0, actionSlotCell, actionSlotCell);
      zone.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(zone);
      this._actionHitZones.push(zone);

      const costText = this.scene.add.text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffeaa0",
        backgroundColor: "#101824cc",
        padding: { x: 4, y: 2 },
      });
      costText.setOrigin(1, 1);
      this._actionGridBackground.add(costText);
      this._actionCostTexts.push(costText);

      const infoText = this.scene.add.text(0, 0, "i", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d7e2ff",
        backgroundColor: "#172131dd",
        padding: { x: 4, y: 1 },
      });
      infoText.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(infoText);
      this._actionInfoTexts.push(infoText);

      const infoZone = this.scene.add.zone(0, 0, 18, 18);
      infoZone.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(infoZone);
      this._actionInfoHitZones.push(infoZone);

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

    this.detailsBackdrop = scene.add.rectangle(0, 0, 800, 600, 0x000000, 0.45);
    this.detailsBackdrop.setOrigin(0, 0);
    this.detailsBackdrop.setInteractive();
    this.detailsBackdrop.on("pointerdown", () => this.hideActionDetails());
    this.detailsBackground = scene.add.rectangle(0, 0, 520, 260, 0x0f1622, 0.97);
    this.detailsBackground.setOrigin(0, 0);
    this.detailsBackground.setStrokeStyle(2, 0x7ca8d6, 0.95);
    this.detailsTitleText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.detailsTitleText.setOrigin(0, 0);
    this.detailsDescriptionText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#d7e2ff",
      wordWrap: { width: 488, useAdvancedWrap: true },
    });
    this.detailsDescriptionText.setOrigin(0, 0);
    this.detailsCostText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#ffeaa0",
    });
    this.detailsCostText.setOrigin(0, 0);
    this.detailsWarningText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ff9a9a",
    });
    this.detailsWarningText.setOrigin(0, 0);
    this.detailsCloseButton = this.createButton("Close", true, () => this.hideActionDetails());
    this.detailsCloseButton.setOrigin(1, 0);
    this.detailsRoot = scene.add.container(0, 0, [
      this.detailsBackdrop,
      this.detailsBackground,
      this.detailsTitleText,
      this.detailsDescriptionText,
      this.detailsCostText,
      this.detailsWarningText,
      this.detailsCloseButton,
    ]);
    this.detailsRoot.setVisible(false);

    this.root.add([
      this.topBackground,
      this.bottomBackground,
      this.menuButton,
      this.speedButton,
      this.pauseButton,
      this.hpText,
      this.goldText,
      this.goldDeltaText,
      this.towersText,
      this.contextPanelFrame,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentIconBg,
      this.upcomingCurrentIcon,
      this.upcomingCurrentIconLabel,
      this.upcomingNextIconBg,
      this.upcomingNextIcon,
      this.upcomingNextIconLabel,
      this.waveProgressTrack,
      this.waveProgressFill,
      this.waveProgressText,
      this.towerCardIconBg,
      this.towerCardIcon,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerRangeTrack,
      this.towerRangeFill,
      this.towerEffectText,
      this._actionGridBackground,
      this.menuBackdrop,
      this.menuDropdownRoot,
      this.keybindOverlayRoot,
      this.tooltipRoot,
      this.detailsRoot,
    ]);

    this.topUiObjects = [
      this.topBackground,
      this.menuButton,
      this.speedButton,
      this.pauseButton,
      this.hpText,
      this.goldText,
      this.goldDeltaText,
      this.towersText,
    ];
    this.bottomUiObjects = [
      this.bottomBackground,
      this.contextPanelFrame,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentIconBg,
      this.upcomingCurrentIcon,
      this.upcomingCurrentIconLabel,
      this.upcomingNextIconBg,
      this.upcomingNextIcon,
      this.upcomingNextIconLabel,
      this.waveProgressTrack,
      this.waveProgressFill,
      this.waveProgressText,
      this.towerCardIconBg,
      this.towerCardIcon,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerRangeTrack,
      this.towerRangeFill,
      this.towerEffectText,
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
    this._keybindFeedback = "";
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
    this.keybindFeedbackText.setText(this._keybindFeedback);
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
        this._keybindFeedback = result.reason === "Key already used" ? "This key is already assigned." : result.reason;
        this.refreshKeybindRows();
        return;
      }
      this.endRebind();
      this._keybindFeedback = "Keybinding saved.";
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
    for (let i = 0; i < this._actionSlotConfigs.length; i += 1) {
      this._actionSlotConfigs[i] = slots[i] ?? null;
      this.updateActionSlotInteractivity(i);
    }
    if (this._detailsSlotIndex >= 0 && !this.hasActionTooltip(this._actionSlotConfigs[this._detailsSlotIndex])) {
      this.hideActionDetails();
    } else if (this._detailsSlotIndex >= 0) {
      this.showActionDetails(this._detailsSlotIndex);
    }
    this.hideActionTooltip();
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
    const infoZone = this._actionInfoHitZones[index];
    const slot = this._actionSlotConfigs[index];
    zone.removeAllListeners();
    infoZone.removeAllListeners();
    if (!slot) {
      zone.disableInteractive();
      infoZone.disableInteractive();
      return;
    }
    const canClick = Boolean(slot.enabled && typeof slot.onClick === "function");
    if (!canClick) {
      zone.disableInteractive();
    } else {
      zone.setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => slot.onClick());
    }
    const canShowInfo = slot.showInfoButton !== false && this.hasActionTooltip(slot);
    if (!canShowInfo) {
      infoZone.disableInteractive();
    } else {
      infoZone.setInteractive({ useHandCursor: true });
      infoZone.on("pointerdown", () => this.showActionDetails(index));
    }
  }

  showActionDetails(index) {
    const slot = this._actionSlotConfigs[index];
    if (!slot || !this.hasActionTooltip(slot)) {
      this.hideActionDetails();
      return;
    }
    this._detailsSlotIndex = index;
    const title = slot.tooltipTitle || slot.label || "Action";
    const description = slot.tooltipDescription || "";
    const hasCost = slot.tooltipCost != null;
    const resource = slot.tooltipResource || "gold";
    const warning = slot.tooltipWarning || "";
    const costText = hasCost ? `Cost: ${slot.tooltipCost} ${resource}` : "Cost: Free";
    this.detailsTitleText.setText(title);
    this.detailsDescriptionText.setText(description);
    this.detailsCostText.setText(costText);
    this.detailsWarningText.setText(warning);
    this.detailsWarningText.setVisible(warning.length > 0);
    this.detailsRoot.setVisible(this._bottomVisible);
    this.layout();
  }

  hideActionDetails() {
    this._detailsSlotIndex = -1;
    this.detailsRoot.setVisible(false);
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
      color: cozyTheme.colors.textPrimary,
      backgroundColor: interactive ? "#4f3f38" : "#3a3130",
      padding: { x: 10, y: 6 },
    });
    button.setOrigin(0, 0.5);

    if (interactive) {
      button.setInteractive({ useHandCursor: true });
      if (typeof onClick === "function") {
        button.on("pointerdown", () => onClick());
      }
      if (useHoverBackground) {
        button.on("pointerover", () => button.setStyle({ backgroundColor: "#6a5648" }));
        button.on("pointerout", () => button.setStyle({ backgroundColor: "#4f3f38" }));
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
      const speedButtonFontSize = this.clamp(Math.round(topHeight * 0.36), 16, 24);
      this.menuButton.setStyle({ fontSize: `${buttonFontSize}px`, padding: { x: 10, y: 6 } });
      this.speedButton.setStyle({ fontSize: `${speedButtonFontSize}px`, padding: { x: 14, y: 9 } });
      this.pauseButton.setStyle({ fontSize: `${buttonFontSize}px`, padding: { x: 12, y: 7 } });
      this.hpText.setStyle({ fontSize: `${statFontSize}px` });
      this.goldText.setStyle({ fontSize: `${statFontSize}px` });
      this.towersText.setStyle({ fontSize: `${statFontSize}px` });

      const contextTitleSize = this.clamp(Math.round(bottomHeight * 0.13), 15, 24);
      const contextInfoSize = this.clamp(Math.round(bottomHeight * 0.1), 12, 18);
      const contextSubSize = this.clamp(Math.round(bottomHeight * 0.085), 11, 16);
      this.contextTitleText.setStyle({ fontSize: `${contextTitleSize}px` });
      this.contextSubtitleText.setStyle({ fontSize: `${contextSubSize}px` });
      this.waveCountText.setStyle({ fontSize: `${contextInfoSize}px` });
      this.waveEnemiesText.setStyle({ fontSize: `${contextInfoSize}px` });
      this.upcomingEnemiesTitleText.setStyle({ fontSize: `${contextSubSize}px` });
      this.upcomingCurrentIconLabel.setStyle({ fontSize: `${contextSubSize}px` });
      this.upcomingNextIconLabel.setStyle({ fontSize: `${contextSubSize}px` });
      this.towerNameTierText.setStyle({ fontSize: `${contextTitleSize}px` });
      this.towerRolePrimaryText.setStyle({ fontSize: `${contextInfoSize}px` });
      const dpsTowerSize = this._towerDpsProminent
        ? this.clamp(Math.round(contextInfoSize * 1.14), 14, 22)
        : contextInfoSize;
      this.towerDpsText.setStyle({
        fontSize: `${dpsTowerSize}px`,
        fontStyle: this._towerDpsProminent ? "bold" : "normal",
      });
      this.towerRangeText.setStyle({ fontSize: `${contextInfoSize}px` });
      this.towerEffectText.setStyle({ fontSize: `${contextSubSize}px` });

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
      this.pauseButton.setPosition(this.speedButton.x + this.speedButton.width + speedGap, centerY);

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
      this.menuBtnSettings.setStyle({ fontSize: `${menuItemFontSize}px`, padding: { x: menuItemPadX, y: menuItemPadY } });
      this.menuBtnMainMenu.setStyle({ fontSize: `${menuItemFontSize}px`, padding: { x: menuItemPadX, y: menuItemPadY } });
      const itemGap = Math.max(38, Math.round(menuHeight * 0.28));
      const itemStartY = Math.max(24, Math.round(menuHeight * 0.18));
      this.menuBtnMapEditor.setPosition(14, itemStartY);
      this.menuBtnSettings.setPosition(14, itemStartY + itemGap);
      this.menuBtnMainMenu.setPosition(14, itemStartY + itemGap * 2);

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
      this.keybindFeedbackText.setPosition(0, footerY - 42);

      const rightPadding = 12;
      const statGap = 20;
      this.towersText.setPosition(rootWidth - rightPadding, centerY);
      this.goldText.setPosition(this.towersText.x - this.towersText.width - statGap, centerY);
      this.hpText.setPosition(this.goldText.x - this.goldText.width - statGap, centerY);
      this.goldDeltaText.setPosition(this.goldText.x + 8, centerY - Math.max(10, Math.round(topHeight * 0.28)));

      const bottomY = Math.max(0, rootHeight - activeBottomHeight);
      let panelPadding = this.clamp(Math.round(rootWidth * 0.015), 8, 14);
      const compactBottom = rootWidth < 760 || this.bottomBarHeight < 190;
      if (compactBottom) {
        panelPadding = Math.max(6, panelPadding - 2);
      }

      const contextPanelW = this.clamp(Math.round(rootWidth * 0.36), 260, 500);
      const contextPanelH = this.clamp(
        Math.round(this.bottomBarHeight * (compactBottom ? 0.82 : 0.86)),
        compactBottom ? 118 : 132,
        Math.max(compactBottom ? 118 : 132, this.bottomBarHeight - panelPadding * 2),
      );
      this.contextPanelFrame.setSize(contextPanelW, contextPanelH);
      this.contextPanelFrame.setPosition(panelPadding, bottomY + panelPadding);
      const contextPad = this.clamp(Math.round(contextPanelW * 0.06), 10, 16);
      this.contextTitleText.setPosition(this.contextPanelFrame.x + contextPad, this.contextPanelFrame.y + contextPad + 2);
      this.contextSubtitleText.setPosition(
        this.contextTitleText.x,
        this.contextTitleText.y + this.contextTitleText.height + Math.max(3, Math.round(contextPad * 0.25)),
      );
      this.waveCountText.setPosition(
        this.contextTitleText.x,
        this.contextSubtitleText.y + this.contextSubtitleText.height + Math.max(4, Math.round(contextPad * 0.3)),
      );
      this.waveEnemiesText.setPosition(
        this.contextTitleText.x,
        this.waveCountText.y + this.waveCountText.height + Math.max(3, Math.round(contextPad * 0.24)),
      );
      const progressTrackY = this.waveEnemiesText.y + this.waveEnemiesText.height + Math.max(3, Math.round(contextPad * 0.24));
      const progressTrackW = Math.max(70, contextPanelW - contextPad * 2);
      const progressTrackH = this.clamp(Math.round(contextPanelH * 0.08), 10, 16);
      this.waveProgressTrack.setPosition(this.contextPanelFrame.x + contextPad, progressTrackY);
      this.waveProgressTrack.setSize(progressTrackW, progressTrackH);
      this.waveProgressFill.setPosition(this.waveProgressTrack.x + 1, this.waveProgressTrack.y + 1);
      this.waveProgressFill.setSize(2, Math.max(2, progressTrackH - 2));
      this.waveProgressText.setStyle({ fontSize: `${this.clamp(Math.round(progressTrackH * 0.95), 11, 16)}px` });
      this.waveProgressText.setPosition(
        this.waveProgressTrack.x,
        this.waveProgressTrack.y + this.waveProgressTrack.height + Math.max(2, Math.round(contextPad * 0.35)),
      );
      const chipY = this.waveProgressText.y + this.waveProgressText.height + Math.max(2, Math.round(contextPad * 0.25));
      this.upcomingEnemiesTitleText.setPosition(this.contextPanelFrame.x + contextPad, chipY);
      const chipTop = this.upcomingEnemiesTitleText.y + this.upcomingEnemiesTitleText.height + Math.max(2, Math.round(contextPad * 0.2));
      this.upcomingCurrentIconBg.setPosition(this.contextPanelFrame.x + contextPad, chipTop);
      this.upcomingCurrentIcon.setPosition(
        this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width / 2,
        this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height / 2,
      );
      this.upcomingCurrentIconLabel.setPosition(this.upcomingCurrentIconBg.x, this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height + 2);
      const nextX = this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width + Math.max(10, Math.round(contextPad * 0.45));
      this.upcomingNextIconBg.setPosition(nextX, chipTop);
      this.upcomingNextIcon.setPosition(
        this.upcomingNextIconBg.x + this.upcomingNextIconBg.width / 2,
        this.upcomingNextIconBg.y + this.upcomingNextIconBg.height / 2,
      );
      this.upcomingNextIconLabel.setPosition(this.upcomingNextIconBg.x, this.upcomingNextIconBg.y + this.upcomingNextIconBg.height + 2);
      this.towerCardIconBg.setPosition(this.contextPanelFrame.x + contextPad, this.contextSubtitleText.y + this.contextSubtitleText.height + 4);
      this.towerCardIcon.setPosition(
        this.towerCardIconBg.x + this.towerCardIconBg.width / 2,
        this.towerCardIconBg.y + this.towerCardIconBg.height / 2,
      );
      const towerContentX = this.towerCardIconBg.x + this.towerCardIconBg.width + Math.max(10, Math.round(contextPad * 0.45));
      this.towerNameTierText.setPosition(towerContentX, this.towerCardIconBg.y);
      this.towerRolePrimaryText.setPosition(towerContentX, this.towerNameTierText.y + this.towerNameTierText.height + 2);
      this.towerDpsText.setPosition(towerContentX, this.towerRolePrimaryText.y + this.towerRolePrimaryText.height + 3);
      this.towerRangeText.setPosition(towerContentX, this.towerDpsText.y + this.towerDpsText.height + 3);
      this.towerRangeTrack.setPosition(towerContentX, this.towerRangeText.y + this.towerRangeText.height + 4);
      this.towerRangeTrack.setSize(Math.max(60, contextPanelW - (towerContentX - this.contextPanelFrame.x) - contextPad), 10);
      this.towerRangeFill.setPosition(this.towerRangeTrack.x + 1, this.towerRangeTrack.y + 1);
      this.towerEffectText.setPosition(towerContentX, this.towerRangeTrack.y + this.towerRangeTrack.height + 4);

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
        const accent = this._actionAccentFrames[i];
        const costText = this._actionCostTexts[i];
        const infoText = this._actionInfoTexts[i];
        const infoZone = this._actionInfoHitZones[i];
        
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
        const accentColor = Number.isFinite(slot?.accentColor) ? slot.accentColor : 0x6f99c9;
        accent
          .setPosition(x, y)
          .setVisible(Boolean(slot))
          .setFillStyle(accentColor, slot?.enabled === false ? 0.18 : 0.34)
          .setStrokeStyle(2, accentColor, slot?.enabled === false ? 0.35 : 0.85);
        if (currentIcon) {
          const offsetX = slot?.iconOffsetX ?? 0;
          const offsetY = slot?.iconOffsetY ?? 0;
          currentIcon
            .setVisible(Boolean(slot))
            .setPosition(x + offsetX, y + offsetY)
            .setDisplaySize(iconSize, iconSize)
            .setAlpha(slot?.enabled === false ? 0.5 : 1);
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

        if (slot && slot.cost != null) {
          costText
            .setVisible(true)
            .setPosition(x + (contentCellW / 2) - 3, y + (contentCellH / 2) - 3)
            .setText(`${slot.cost}g`)
            .setAlpha(slot.enabled === false ? 0.7 : 1);
        } else {
          costText.setVisible(false);
        }

        const showInfo = Boolean(slot && slot.showInfoButton !== false && this.hasActionTooltip(slot));
        infoText
          .setVisible(showInfo)
          .setPosition(x + (contentCellW / 2) - 10, y - (contentCellH / 2) + 10)
          .setAlpha(slot?.enabled === false ? 0.7 : 1);
        infoZone
          .setPosition(infoText.x, infoText.y)
          .setSize(18, 18)
          .setVisible(showInfo);

        if (currentIcon && showInlineLabel) {
          button.setOrigin(1, 0.5);
          button.setX(x - (iconSize / 2) - 8);
          button.setStyle({ fontSize: `13px`, color: "#ffffff", stroke: "#000000", strokeThickness: 3 });
        } else {
          button.setOrigin(0.5, 0.5);
        }
      }
      for (const infoZone of this._actionInfoHitZones) {
        this._actionGridBackground.bringToTop(infoZone);
      }
      for (const z of this._actionHitZones) {
        this._actionGridBackground.bringToTop(z);
      }
      if (this.tooltipRoot.visible) {
        this.moveActionTooltip();
      }

      this.detailsBackdrop.setPosition(0, 0);
      this.detailsBackdrop.setSize(rootWidth, rootHeight);
      const detailsW = this.clamp(Math.round(rootWidth * 0.4), 420, 560);
      const detailsH = this.clamp(Math.round(rootHeight * 0.35), 220, 320);
      const detailsX = this.clamp(Math.round(rootWidth * 0.5 - detailsW / 2), 8, rootWidth - detailsW - 8);
      const detailsY = this.clamp(Math.round(rootHeight * 0.5 - detailsH / 2), 8, rootHeight - detailsH - 8);
      this.detailsBackground.setPosition(detailsX, detailsY);
      this.detailsBackground.setSize(detailsW, detailsH);
      this.detailsDescriptionText.setWordWrapWidth(detailsW - 32, true);
      this.detailsTitleText.setPosition(detailsX + 14, detailsY + 12);
      this.detailsDescriptionText.setPosition(detailsX + 14, this.detailsTitleText.y + this.detailsTitleText.height + 8);
      this.detailsCostText.setPosition(detailsX + 14, this.detailsDescriptionText.y + this.detailsDescriptionText.height + 8);
      this.detailsWarningText.setPosition(detailsX + 14, this.detailsCostText.y + this.detailsCostText.height + 6);
      this.detailsCloseButton.setPosition(detailsX + detailsW - 10, detailsY + 8);
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
    const showWavePanel = this._bottomVisible && this._contextMode === "wave";
    const showTowerPanel = this._bottomVisible && this._contextMode === "tower";
    this.contextPanelFrame.setVisible(this._bottomVisible);
    this.contextTitleText.setVisible(this._bottomVisible);
    this.contextSubtitleText.setVisible(this._bottomVisible);
    this.waveCountText.setVisible(showWavePanel);
    this.waveEnemiesText.setVisible(showWavePanel);
    this.waveProgressTrack.setVisible(showWavePanel);
    this.waveProgressFill.setVisible(showWavePanel);
    this.waveProgressText.setVisible(showWavePanel);
    this.upcomingEnemiesTitleText.setVisible(showWavePanel);
    this.upcomingCurrentIconBg.setVisible(showWavePanel);
    this.upcomingCurrentIcon.setVisible(showWavePanel && this.upcomingCurrentIcon.visible);
    this.upcomingCurrentIconLabel.setVisible(showWavePanel);
    this.upcomingNextIconBg.setVisible(showWavePanel);
    this.upcomingNextIcon.setVisible(showWavePanel && this.upcomingNextIcon.visible);
    this.upcomingNextIconLabel.setVisible(showWavePanel);
    this.towerCardIconBg.setVisible(showTowerPanel);
    this.towerCardIcon.setVisible(showTowerPanel && this.towerCardIcon.visible);
    this.towerNameTierText.setVisible(showTowerPanel);
    this.towerRolePrimaryText.setVisible(showTowerPanel);
    this.towerDpsText.setVisible(showTowerPanel);
    this.towerRangeText.setVisible(showTowerPanel);
    this.towerRangeTrack.setVisible(showTowerPanel);
    this.towerRangeFill.setVisible(showTowerPanel);
    this.towerEffectText.setVisible(showTowerPanel);
    if (!this._bottomVisible) {
      this.hideActionTooltip();
      this.hideActionDetails();
    }
    for (let idx = 0; idx < this._actionHitZones.length; idx += 1) {
      const zone = this._actionHitZones[idx];
      const infoZone = this._actionInfoHitZones[idx];
      const slot = this._actionSlotConfigs[idx];
      const wantsInput = Boolean(this._bottomVisible && slot && slot?.enabled && typeof slot?.onClick === "function");
      if (wantsInput) {
        zone.setInteractive({ useHandCursor: true });
      } else {
        zone.disableInteractive();
      }
      const wantsInfo = Boolean(this._bottomVisible && slot && slot.showInfoButton !== false && this.hasActionTooltip(slot));
      if (wantsInfo) {
        infoZone.setInteractive({ useHandCursor: true });
      } else {
        infoZone.disableInteractive();
      }
    }
    this.detailsRoot.setVisible(this._bottomVisible && this._detailsSlotIndex >= 0);
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

  render(state, towerCount = 0, maxLives = this.maxLives, selectedBuilding = null, waveInfo = null) {
    this._selectedBuilding = selectedBuilding;
    this._waveInfo = waveInfo;
    const rawSpeed = Number(state.gameSpeed);
    const gameSpeed =
      Number.isFinite(rawSpeed) ? Math.max(1, Math.min(3, Math.round(rawSpeed))) : 1;
    this.speedButton.setText(`Speed x${gameSpeed}`);
    this.applySpeedButtonStyle(gameSpeed);
    this.pauseButton.setText(state.paused ? "Resume" : "Pause");
    const hpMax = typeof maxLives === "number" && maxLives > 0 ? maxLives : state.lives;
    this.hpText.setText(`HP: ${state.lives}/${hpMax}`);
    this.updateGoldDelta(state.gold);
    this.goldText.setText(`Gold: ${state.gold}`);
    this.towersText.setText(`Towers: ${towerCount}`);
    this.updateSelectionText();
    this.layout();
  }

  updateSelectionText() {
    const selected = this._selectedBuilding;
    if (!selected || selected.kind !== "tower") {
      this._towerDpsProminent = false;
      this._contextMode = "wave";
      const waveNumber = Number.isFinite(this._waveInfo?.wave) ? this._waveInfo.wave : 1;
      const enemiesAlive = Number.isFinite(this._waveInfo?.enemiesAlive) ? this._waveInfo.enemiesAlive : 0;
      const totalSpawned = Number.isFinite(this._waveInfo?.totalSpawned) ? this._waveInfo.totalSpawned : 0;
      const spawnTarget = Number.isFinite(this._waveInfo?.spawnTarget) ? this._waveInfo.spawnTarget : 0;
      this.contextTitleText.setText("Wave Status");
      this.contextSubtitleText.setText(this.formatRoleSubtitle(this._waveInfo?.upcoming?.current));
      this.waveCountText.setText(`Wave: ${waveNumber}`);
      this.waveEnemiesText.setText(`Enemies: ${enemiesAlive}  Spawned: ${totalSpawned}/${spawnTarget}`);
      this.upcomingCurrentIconLabel.setText(`Now: ${this.formatRoleLabel(this._waveInfo?.upcoming?.current?.role)}`);
      this.upcomingNextIconLabel.setText(`Next: ${this.formatRoleLabel(this._waveInfo?.upcoming?.next?.role)}`);
      this.applyPreviewIcon(this.upcomingCurrentIcon, this._waveInfo?.upcoming?.current);
      this.applyPreviewIcon(this.upcomingNextIcon, this._waveInfo?.upcoming?.next);
      this.setWaveProgressVisual(this._waveInfo?.progress);
      return;
    }
    this._contextMode = "tower";
    const selectedCount = Number(selected.selectedCount);
    const hasGroupSelection = Number.isFinite(selectedCount) && selectedCount > 1;
    const tierValue = Number.isFinite(selected.tier) ? selected.tier + 1 : 1;
    this.contextTitleText.setText("Tower Details");
    this.contextSubtitleText.setText(hasGroupSelection ? `${Math.floor(selectedCount)} selected` : "Single selection");
    this.towerNameTierText.setText(`${selected.label} · Tier ${tierValue}`);
    const damage = Number.isFinite(selected.damage) ? selected.damage : 0;
    const cooldown = Number.isFinite(selected.cooldown) && selected.cooldown > 0 ? selected.cooldown : 1;
    const roleModel = getTowerRoleHudModel(selected.type, selected.effects ?? [], damage, cooldown);
    this._towerDpsProminent = Boolean(roleModel.dpsProminent);
    const range = Number.isFinite(selected.range) ? selected.range : 0;
    this.towerRolePrimaryText.setText(roleModel.primaryLine || "");
    this.towerRolePrimaryText.setVisible(Boolean(roleModel.primaryLine));
    const dpsWarn = roleModel.showUtilityWarning;
    this.towerDpsText.setText(dpsWarn ? `${roleModel.dpsLine}  \u26A0 Utility-limited` : roleModel.dpsLine);
    this.towerDpsText.setColor(dpsWarn ? "#ffb86b" : roleModel.dpsProminent ? "#fff4c2" : "#d6e7ff");
    this.towerRangeText.setText(`Range: ${Math.round(range)}`);
    this.setTowerRangeVisual(range);
    this.towerEffectText.setText(`Effect: ${selected.effectSummary || "No special effects"}`);
    this.applyTowerIcon(this.towerCardIcon, selected.iconKey);
  }

  formatRoleLabel(rawRole) {
    const role = typeof rawRole === "string" && rawRole.length > 0 ? rawRole : "normal";
    return role
      .split("_")
      .join(" ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  formatRoleSubtitle(currentWavePreview) {
    if (!currentWavePreview) {
      return "Role: Unknown";
    }
    const primary = this.formatRoleLabel(currentWavePreview.role);
    const secondary = currentWavePreview.secondaryRole ? this.formatRoleLabel(currentWavePreview.secondaryRole) : null;
    return secondary ? `Role: ${primary} + ${secondary}` : `Role: ${primary}`;
  }

  applyPreviewIcon(image, preview) {
    if (!image) {
      return;
    }
    const keys = [
      preview?.iconKey,
      preview?.visual?.textureKey,
      "redWarriorRunSheet",
    ];
    for (const key of keys) {
      if (typeof key !== "string" || key.length === 0) {
        continue;
      }
      if (!this.scene.textures.exists(key)) {
        continue;
      }
      image.setTexture(key);
      image.setDisplaySize(28, 28);
      image.setVisible(true);
      return;
    }
    image.setVisible(false);
  }

  applyTowerIcon(image, iconKey) {
    if (!image) {
      return;
    }
    const fallback = "blueTower";
    const nextKey = this.scene.textures.exists(iconKey) ? iconKey : this.scene.textures.exists(fallback) ? fallback : null;
    if (!nextKey) {
      image.setVisible(false);
      return;
    }
    image.setTexture(nextKey);
    image.setDisplaySize(54, 54);
    image.setVisible(true);
  }

  setTowerRangeVisual(rawRange) {
    const maxRange = 220;
    const range = Number.isFinite(rawRange) ? this.clamp(rawRange, 0, maxRange) : 0;
    const ratio = maxRange > 0 ? range / maxRange : 0;
    const trackInnerWidth = Math.max(2, this.towerRangeTrack.width - 2);
    this.towerRangeFill.width = Math.max(2, Math.round(trackInnerWidth * ratio));
    this.towerRangeFill.height = Math.max(2, this.towerRangeTrack.height - 2);
  }

  setWaveProgressVisual(rawProgress) {
    const progress = Number.isFinite(rawProgress) ? this.clamp(rawProgress, 0, 1) : 0;
    const trackInnerWidth = Math.max(2, this.waveProgressTrack.width - 2);
    this.waveProgressFill.width = Math.max(2, Math.round(trackInnerWidth * progress));
    const pct = Math.round(progress * 100);
    this.waveProgressText.setText(`Progress: ${pct}%`);
  }

  applySpeedButtonStyle(gameSpeed) {
    if (gameSpeed >= 3) {
      this.speedButton.setStyle({ backgroundColor: "#9a6a2a", color: "#fff7dd" });
      return;
    }
    if (gameSpeed === 2) {
      this.speedButton.setStyle({ backgroundColor: "#5e6b3a", color: "#f1ffe2" });
      return;
    }
    this.speedButton.setStyle({ backgroundColor: "#4f3f38", color: cozyTheme.colors.textPrimary });
  }

  updateGoldDelta(rawGold) {
    const nextGold = Math.floor(Number(rawGold) || 0);
    if (this._lastGoldValue == null) {
      this._lastGoldValue = nextGold;
      return;
    }
    const delta = nextGold - this._lastGoldValue;
    this._lastGoldValue = nextGold;
    if (delta === 0) {
      return;
    }
    this._goldDeltaTween?.stop?.();
    this._goldDeltaTween?.remove?.();
    const positive = delta > 0;
    this.goldDeltaText.setText(`${positive ? "+" : ""}${delta}`);
    this.goldDeltaText.setStyle({ color: positive ? "#8df5a6" : "#ff9d9d" });
    this.goldDeltaText.setAlpha(1);
    this.goldDeltaText.setVisible(true);
    this.goldDeltaText.y -= 4;
    this._goldDeltaTween = this.scene.tweens.add({
      targets: this.goldDeltaText,
      y: this.goldDeltaText.y - 16,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.goldDeltaText.setVisible(false);
        this.goldDeltaText.setAlpha(1);
      },
    });
  }

}
