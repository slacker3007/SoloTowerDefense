import Phaser from "phaser";
import { getTowerRoleHudModel } from "../balance";
import { cozyTheme, createHudButton } from "./CozyTheme";
import { formatKeyLabel, GRID_KEYBIND_ACTION_IDS } from "../input/KeybindStore.js";
import {
  createBottomBarChrome,
  createFantasyActionSlot,
  createFantasyBarTrackHost,
  createFantasyButton,
  createFantasyChipHost,
  createFantasyMenuRow,
  createFantasyPanel,
  darkFantasyPalette,
  drawStonePanel,
  drawVerticalDivider,
} from "./FantasyHudChrome.js";

/** When false, wave/tower context panel is hidden; only the action rail shows. */
const SHOW_CONTEXT_PANEL = false;
const ACTION_SLOT_COUNT = 10;
const ACTION_GRID_COLS = 10;
const ACTION_GRID_ROWS = 1;

/** Padding for floating editor menu (no top bar). */
const FLOATING_MENU_PAD = 8;

/** Discrete pills for wave spawn/clear progress bar. */
const WAVE_PROGRESS_SEGMENT_COUNT = 8;
const WAVE_PROGRESS_SEGMENT_GAP = 3;
/** Pixels below preview icon for role label (Normal, Tank, …). */
const WAVE_PREVIEW_ROLE_GAP = 24;
/** Vertical gap between wave title row and enemies/progress/previews block. */
const WAVE_TITLE_TO_BODY_GAP = 13;

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   maxLives?: number,
   *   onMapEditorFromMenu?: () => void,
   *   onOpenSettings?: () => void,
   *   onMainMenu?: () => void,
   *   onCycleGameSpeed?: () => void,
  *   onTogglePause?: () => void,
   *   keybindStore?: import("../input/KeybindStore.js").KeybindStore,
   * }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.keybindStore = options.keybindStore ?? null;
    this.maxLives = typeof options.maxLives === "number" ? options.maxLives : 0;
    this.onMapEditorFromMenu = typeof options.onMapEditorFromMenu === "function" ? options.onMapEditorFromMenu : () => {};
    this.onOpenSettings = typeof options.onOpenSettings === "function" ? options.onOpenSettings : () => {};
    this.onMainMenu = typeof options.onMainMenu === "function" ? options.onMainMenu : () => {};
    this.onCycleGameSpeed = typeof options.onCycleGameSpeed === "function" ? options.onCycleGameSpeed : () => {};
    this.onTogglePause = typeof options.onTogglePause === "function" ? options.onTogglePause : () => {};

    this._menuDropdownOpen = false;

    this.topBarHeight = 64;
    this.bottomBarHeight = 360;
    this.depth = 100;
    this.rootOffsetX = 0;
    this.rootOffsetY = 0;
    this.rootScale = 1;
    this.actionPanelScale = 1;
    this.actionPanelCorner = "bottom-left";
    this.actionPanelMarginX = 16;
    this.actionPanelMarginY = 16;
    this.actionPanelOffsetX = 0;
    this.actionPanelOffsetY = 0;
    this._selectedBuilding = null;
    this._waveInfo = null;
    this._towerDpsProminent = false;
    /** Bottom chrome height used for camera occlusion (set in layout). */
    this._effectiveBottomChromeHeight = 0;
    /** Right chrome width used for camera occlusion in landscape split mode. */
    this._effectiveRightChromeWidth = 0;
    this._effectiveLeftChromeWidth = 0;
    this._cameraTelemetry = { zoom: 1, x: 0, y: 0 };
    this._debugPanelVisible = false;
    this._viewportMode = "portrait";
    this._actionButtons = [];
    /** @type {Phaser.GameObjects.Zone[]} Full-cell hit targets for action grid slots (64×64 local space). */
    this._actionHitZones = [];
    this._actionGridBackground = null;
    this._actionIcons = [];
    this._actionSlotFrames = [];
    /** @type {import("./FantasyHudChrome.js").ReturnType<createFantasyButton>[]} */
    this._leftUtilityButtons = [];
    /** @type {import("./FantasyHudChrome.js").ReturnType<createFantasyButton>[]} */
    this._rightUtilityButtons = [];
    this._bottomSpeedButton = null;
    this._bottomPauseButton = null;
    this._bottomTrayBounds = { x: 0, y: 0, width: 0, height: 0 };
    this._goldBarScreenPos = null;
    this._bottomMenuAnchor = null;
    this._actionCostTexts = [];
    this._actionInfoTexts = [];
    this._actionInfoHitZones = [];
    this._actionSlotConfigs = Array.from({ length: ACTION_SLOT_COUNT }, () => null);
    this._hoveredActionIndex = -1;
    this._tooltipAnchor = { x: 0, y: 0 };
    this._topVisible = false;
    this._bottomVisible = true;
    this._detailsSlotIndex = -1;
    this._detailsCloseWorldBlockFrame = -1;
    this.root = scene.add.container(0, 0);
    this.root.setDepth(this.depth);
    this.root.setScrollFactor(0);
    this._hudColors = cozyTheme.hud;
    this._previewIconSize = 44;
    /** Action strip bounds for camera occlusion (set in layout). */
    this._actionStripBounds = { x: 0, y: 0, width: 0, height: 0 };

    this.topBackground = scene.add.rectangle(0, 0, scene.scale.width, this.topBarHeight, this._hudColors.topBar, 0.93);
    this.topBackground.setOrigin(0, 0);
    this.topBackground.setVisible(false);

    const menuKeybindLabel = this._menuKeybindLabel();
    this._bottomChrome = createBottomBarChrome(scene);
    this._leftUtilityButtons = [
      createFantasyButton(scene, {
        icon: "hamburger",
        onClick: () => this.toggleMenuDropdown(),
      }),
      createFantasyButton(scene, { label: "⚙", onClick: () => this.onOpenSettings() }),
      createFantasyButton(scene, { label: "✦", interactive: false }),
      createFantasyButton(scene, { label: "≡", interactive: false }),
    ];
    this._rightUtilityButtons = [
      createFantasyButton(scene, { label: "x1", onClick: () => this.onCycleGameSpeed() }),
      createFantasyButton(scene, { label: "⏸", onClick: () => this.onTogglePause() }),
      createFantasyButton(scene, { label: "◎", interactive: false }),
    ];
    this._bottomSpeedButton = this._rightUtilityButtons[0];
    this._bottomPauseButton = this._rightUtilityButtons[1];
    for (const btn of this._leftUtilityButtons) {
      this._bottomChrome.leftRail.add(btn.container);
    }
    for (const btn of this._rightUtilityButtons) {
      this._bottomChrome.rightRail.add(btn.container);
    }

    this._editorMenuButton = createFantasyButton(scene, {
      label: "☰",
      keybindLabel: menuKeybindLabel,
      keybindCorner: "top",
      onClick: () => this.toggleMenuDropdown(),
    });
    this.menuButton = this._editorMenuButton.container;
    this.speedButton = this.createButton("x1", true, () => this.onCycleGameSpeed());
    this.pauseButton = this.createButton("Pause", true, () => this.onTogglePause());

    this.menuBackdrop = scene.add.rectangle(0, 0, 800, 600, 0x000011, 0.35);
    this.menuBackdrop.setOrigin(0, 0);
    this.menuBackdrop.setInteractive();
    this.menuBackdrop.on("pointerdown", (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this.closeMenuDropdown();
    });
    this.menuBackdrop.setVisible(false);

    this.menuDropdownPanel = createFantasyPanel(scene);
    this.menuDropdownPanel.setSize(320, 220);

    this.menuBtnMapEditor = createFantasyMenuRow(scene, {
      label: "Map editor",
      onClick: () => {
        this.closeMenuDropdown();
        this.onMapEditorFromMenu();
      },
    });
    this.menuBtnMapEditor.setVisible(false);
    this.menuBtnSettings = createFantasyMenuRow(scene, {
      label: "Settings",
      onClick: () => {
        this.closeMenuDropdown();
        this.onOpenSettings();
      },
    });
    this.menuBtnMainMenu = createFantasyMenuRow(scene, {
      label: "Main menu",
      onClick: () => {
        this.closeMenuDropdown();
        this.onMainMenu();
      },
    });

    this.menuDropdownRoot = scene.add.container(0, 0, [
      this.menuDropdownPanel.container,
      this.menuBtnMapEditor.container,
      this.menuBtnSettings.container,
      this.menuBtnMainMenu.container,
    ]);
    this.menuDropdownRoot.setVisible(false);

    this.hpText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "18px",
      color: cozyTheme.hud.chipText,
    });
    this.goldText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "18px",
      color: cozyTheme.colors.textWarning,
    });
    this.towersText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "18px",
      color: cozyTheme.hud.chipText,
    });
    this.cameraTelemetryText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#d2e4ff",
    });
    this.cameraTelemetryText.setVisible(false);
    this.debugPanelBg = scene.add.rectangle(0, 0, 340, 76, 0x0d1522, 0.9);
    this.debugPanelBg.setOrigin(0, 0);
    this.debugPanelBg.setStrokeStyle(1, 0x5f7aa3, 0.95);
    this.debugPanelText = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#d2e4ff",
      lineSpacing: 4,
    });
    this.debugPanelText.setOrigin(0, 0);
    this.debugPanelRoot = scene.add.container(0, 0, [this.debugPanelBg, this.debugPanelText]);
    this.debugPanelRoot.setVisible(false);
    this.contextPanelFrame = createFantasyPanel(scene);
    this.contextPanelFrame.setSize(320, 130);
    this.contextTitleText = scene.add.text(0, 0, "Battle Context", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: darkFantasyPalette.textPrimary,
    });
    this.contextTitleText.setOrigin(0, 0);
    this.contextSubtitleText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "13px",
      color: darkFantasyPalette.textMuted,
    });
    this.contextSubtitleText.setOrigin(0, 0);
    this.waveCountText = scene.add.text(0, 0, "Wave: 1", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textMuted,
    });
    this.waveCountText.setOrigin(0, 0);
    this.waveEnemiesText = scene.add.text(0, 0, "Enemies: 0", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textMuted,
    });
    this.waveEnemiesText.setOrigin(0, 0);
    this.upcomingEnemiesTitleText = scene.add.text(0, 0, "Upcoming", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "12px",
      color: darkFantasyPalette.textMuted,
    });
    this.upcomingEnemiesTitleText.setOrigin(0, 0);
    this.upcomingCurrentIconBg = createFantasyChipHost(scene);
    this.upcomingCurrentIcon = scene.add.image(0, 0, "__WHITE");
    this.upcomingCurrentIcon.setVisible(false);
    this.upcomingCurrentNowText = scene.add.text(0, 0, "Now", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#fff8e6",
      stroke: "#0d0a06",
      strokeThickness: 2,
    });
    this.upcomingCurrentNowText.setOrigin(0, 1);
    this.upcomingCurrentRoleText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "11px",
      color: darkFantasyPalette.textMuted,
    });
    this.upcomingCurrentRoleText.setOrigin(0, 0);
    this.upcomingNextIconBg = createFantasyChipHost(scene);
    this.upcomingNextIcon = scene.add.image(0, 0, "__WHITE");
    this.upcomingNextIcon.setVisible(false);
    this.upcomingNextNowText = scene.add.text(0, 0, "Next", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#fff8e6",
      stroke: "#0d0a06",
      strokeThickness: 2,
    });
    this.upcomingNextNowText.setOrigin(0, 1);
    this.upcomingNextRoleText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "11px",
      color: darkFantasyPalette.textMuted,
    });
    this.upcomingNextRoleText.setOrigin(0, 0);
    this.towerCardIconBg = createFantasyChipHost(scene);
    this.towerCardIconBg.setSize(72, 72);
    this.towerCardIcon = scene.add.image(0, 0, "__WHITE");
    this.towerCardIcon.setVisible(false);
    this.towerNameTierText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: darkFantasyPalette.textPrimary,
    });
    this.towerNameTierText.setOrigin(0, 0);
    this.towerRolePrimaryText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textPrimary,
    });
    this.towerRolePrimaryText.setOrigin(0, 0);
    this.towerDpsText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textMuted,
    });
    this.towerDpsText.setOrigin(0, 0);
    this.towerRangeText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textMuted,
    });
    this.towerRangeText.setOrigin(0, 0);
    this.towerRangeTrack = createFantasyBarTrackHost(scene);
    this.towerRangeFill = scene.add.rectangle(0, 0, 2, 8, darkFantasyPalette.slotGlow, 1);
    this.towerRangeFill.setOrigin(0, 0);
    this.towerEffectText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "12px",
      color: darkFantasyPalette.textMuted,
      wordWrap: { width: 400, useAdvancedWrap: true },
    });
    this.towerEffectText.setOrigin(0, 0);
    this._contextMode = "wave";

    for (const text of [
      this.hpText,
      this.goldText,
      this.towersText,
      this.cameraTelemetryText,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentNowText,
      this.upcomingCurrentRoleText,
      this.upcomingNextNowText,
      this.upcomingNextRoleText,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerEffectText,
    ]) {
      text.setOrigin(0, 0.5);
    }

    this.hpText.setOrigin(0, 0.5);
    this.goldText.setOrigin(1, 0.5);
    this.towersText.setOrigin(1, 0.5);
    this.contextTitleText.setOrigin(0, 0);
    this.contextSubtitleText.setOrigin(0, 0);
    this.waveCountText.setOrigin(0, 0);
    this.waveEnemiesText.setOrigin(0, 0);
    this.upcomingEnemiesTitleText.setOrigin(0, 0);
    this.upcomingCurrentNowText.setOrigin(0, 1);
    this.upcomingCurrentRoleText.setOrigin(0, 0);
    this.upcomingNextNowText.setOrigin(0, 1);
    this.upcomingNextRoleText.setOrigin(0, 0);
    this.towerNameTierText.setOrigin(0, 0);
    this.towerRolePrimaryText.setOrigin(0, 0);
    this.towerDpsText.setOrigin(0, 0);
    this.towerRangeText.setOrigin(0, 0);
    this.towerEffectText.setOrigin(0, 0);

    this.waveProgressTrack = createFantasyBarTrackHost(scene);
    this.waveProgressSegments = scene.add.graphics();
    this.waveProgressText = scene.add.text(0, 0, "0%", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "13px",
      color: cozyTheme.colors.textWarning,
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

    const actionSlotCell = cozyTheme.darkFantasy.slotSize;
    for (let i = 0; i < ACTION_SLOT_COUNT; i += 1) {
      const slotFrame = createFantasyActionSlot(this.scene, actionSlotCell, "");
      this._actionGridBackground.add(slotFrame.container);
      this._actionSlotFrames.push(slotFrame);

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
        fontFamily: cozyTheme.typography.bodyFamily,
        fontSize: "12px",
        color: cozyTheme.colors.textWarning,
        backgroundColor: darkFantasyPalette.costBadgeBg,
        padding: { x: 5, y: 3 },
      });
      costText.setOrigin(0, 0);
      this._actionGridBackground.add(costText);
      this._actionCostTexts.push(costText);

      const infoText = this.scene.add.text(0, 0, "i", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: darkFantasyPalette.textPrimary,
        backgroundColor: darkFantasyPalette.infoBadgeBg,
        padding: { x: 4, y: 1 },
      });
      infoText.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(infoText);
      this._actionInfoTexts.push(infoText);

      const infoZone = this.scene.add.zone(0, 0, 22, 22);
      infoZone.setOrigin(0.5, 0.5);
      this._actionGridBackground.add(infoZone);
      this._actionInfoHitZones.push(infoZone);

      this._actionIcons.push(null);
    }

    this._bottomChrome.actionHost.add(this._actionGridBackground);

    this.tooltipPanel = createFantasyPanel(scene);
    this.tooltipPanel.setSize(300, 120);
    this.tooltipTitleText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "17px",
      color: darkFantasyPalette.textPrimary,
      fontStyle: "bold",
    });
    this.tooltipTitleText.setOrigin(0, 0);
    this.tooltipDescriptionText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "24px",
      color: darkFantasyPalette.textMuted,
      wordWrap: { width: 510, useAdvancedWrap: true },
    });
    this.tooltipDescriptionText.setOrigin(0, 0);
    this.tooltipCostText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "15px",
      color: cozyTheme.colors.textWarning,
    });
    this.tooltipCostText.setOrigin(0, 0);
    this.tooltipWarningText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textDanger,
    });
    this.tooltipWarningText.setOrigin(0, 0);
    this.tooltipRoot = scene.add.container(0, 0, [
      this.tooltipPanel.container,
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
    this.detailsPanel = createFantasyPanel(scene);
    this.detailsPanel.setSize(520, 260);
    this.detailsTitleText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "20px",
      color: darkFantasyPalette.textPrimary,
      fontStyle: "bold",
    });
    this.detailsTitleText.setOrigin(0, 0);
    this.detailsDescriptionText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: darkFantasyPalette.textMuted,
      wordWrap: { width: 488, useAdvancedWrap: true },
    });
    this.detailsDescriptionText.setOrigin(0, 0);
    this.detailsCostText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "15px",
      color: cozyTheme.colors.textWarning,
    });
    this.detailsCostText.setOrigin(0, 0);
    this.detailsWarningText = scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: darkFantasyPalette.textDanger,
    });
    this.detailsWarningText.setOrigin(0, 0);
    this._detailsCloseFantasy = createFantasyButton(scene, {
      label: "×",
      width: 28,
      height: 28,
      onClick: () => this.hideActionDetails(),
    });
    this.detailsCloseButton = this._detailsCloseFantasy.container;
    this.detailsRoot = scene.add.container(0, 0, [
      this.detailsBackdrop,
      this.detailsPanel.container,
      this.detailsTitleText,
      this.detailsDescriptionText,
      this.detailsCostText,
      this.detailsWarningText,
      this.detailsCloseButton,
    ]);
    this.detailsRoot.setVisible(false);

    this.root.add([
      this.topBackground,
      this._bottomChrome.root,
      this.menuButton,
      this.speedButton,
      this.pauseButton,
      this.hpText,
      this.goldText,
      this.goldDeltaText,
      this.towersText,
      this.cameraTelemetryText,
      this.debugPanelRoot,
      this.contextPanelFrame.container,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentIconBg.container,
      this.upcomingCurrentIcon,
      this.upcomingCurrentNowText,
      this.upcomingCurrentRoleText,
      this.upcomingNextIconBg.container,
      this.upcomingNextIcon,
      this.upcomingNextNowText,
      this.upcomingNextRoleText,
      this.waveProgressTrack.container,
      this.waveProgressSegments,
      this.waveProgressText,
      this.towerCardIconBg.container,
      this.towerCardIcon,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerRangeTrack.container,
      this.towerRangeFill,
      this.towerEffectText,
      this.menuBackdrop,
      this.menuDropdownRoot,
      this.tooltipRoot,
      this.detailsRoot,
    ]);

    this.topUiObjects = [
      this.menuButton,
      this.speedButton,
      this.pauseButton,
      this.hpText,
      this.goldText,
      this.goldDeltaText,
      this.towersText,
    ];
    this.bottomUiObjects = [
      this._bottomChrome.root,
      this.contextPanelFrame.container,
      this.contextTitleText,
      this.contextSubtitleText,
      this.waveCountText,
      this.waveEnemiesText,
      this.upcomingEnemiesTitleText,
      this.upcomingCurrentIconBg.container,
      this.upcomingCurrentIcon,
      this.upcomingCurrentNowText,
      this.upcomingCurrentRoleText,
      this.upcomingNextIconBg.container,
      this.upcomingNextIcon,
      this.upcomingNextNowText,
      this.upcomingNextRoleText,
      this.waveProgressTrack.container,
      this.waveProgressSegments,
      this.waveProgressText,
      this.towerCardIconBg.container,
      this.towerCardIcon,
      this.towerNameTierText,
      this.towerRolePrimaryText,
      this.towerDpsText,
      this.towerRangeText,
      this.towerRangeTrack.container,
      this.towerRangeFill,
      this.towerEffectText,
    ];
    this.uiObjects = [
      ...this.topUiObjects,
      ...this.bottomUiObjects,
    ];
    this.layout();
  }

  _menuKeybindLabel() {
    if (!this.keybindStore) {
      return "";
    }
    return formatKeyLabel(this.keybindStore.getCode("backOrClose"));
  }

  _refreshMenuKeybindLabels() {
    const label = this._menuKeybindLabel();
    this._editorMenuButton?.setKeybindLabel?.(label);
  }

  /**
   * @param {import("./FantasyHudChrome.js").ReturnType<createFantasyActionSlot>} slotFrame
   */
  _syncActionSlotKeybindLayer(slotFrame, slotLeft, slotTop, contentCellW, contentCellH, visible) {
    const keybindText = slotFrame?.keybindText;
    if (!keybindText) {
      return;
    }
    const grid = this._actionGridBackground;
    if (keybindText.parentContainer === slotFrame.container) {
      slotFrame.container.remove(keybindText);
      grid.add(keybindText);
    }
    keybindText.setOrigin(1, 1);
    keybindText.setPosition(slotLeft + contentCellW - 4, slotTop + contentCellH - 3);
    keybindText.setVisible(Boolean(visible && keybindText.text));
  }

  _getVisiblePanelRects() {
    const rects = [];
    if (this._bottomVisible && this._bottomTrayBounds?.width > 0) {
      rects.push(this._bottomTrayBounds);
    } else if (this._bottomVisible && this._actionStripBounds?.width > 0) {
      rects.push(this._actionStripBounds);
    }
    return rects;
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

  isMenuDropdownOpen() {
    return this._menuDropdownOpen;
  }

  applyMenuOverlayVisibility() {
    const drop = Boolean(
      this._menuDropdownOpen && (this._topVisible || this._bottomVisible),
    );
    this.menuBackdrop.setVisible(drop);
    this.menuDropdownRoot.setVisible(drop);
  }

  dispose() {
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
    const slotFrame = this._actionSlotFrames[index];
    const canClick = Boolean(slot.enabled && typeof slot.onClick === "function");
    if (!canClick) {
      zone.disableInteractive();
    } else {
      zone.setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => {
        slotFrame?.setState("pressed");
        slot.onClick();
      });
      zone.on("pointerup", () => slotFrame?.setState("hover"));
      zone.on("pointerover", (pointer) => {
        slotFrame?.setState("hover");
        this.showActionTooltip(index, pointer);
      });
      zone.on("pointerout", () => {
        slotFrame?.setState("regular");
        this.hideActionTooltip();
      });
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
    this._detailsCloseWorldBlockFrame = this.scene?.sys?.game?.loop?.frame ?? -1;
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
    this.tooltipPanel.setSize(tooltipW, tooltipH);
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
    const maxX = Math.max(4, rootWidth - this.tooltipPanel.width - 4);
    const maxY = Math.max(4, rootHeight - this.tooltipPanel.height - 4);
    const x = this.clamp(localX + offsetX, 4, maxX);
    const y = this.clamp(localY + offsetY, 4, maxY);
    this.tooltipRoot.setPosition(x, y);
  }

  hideActionTooltip() {
    this._hoveredActionIndex = -1;
    this.tooltipRoot.setVisible(false);
  }

  createButton(label, interactive, onClick = null, useHoverBackground = true) {
    const compact = label.length <= 2 || label === "×";
    return createHudButton(this.scene, label, onClick, {
      interactive,
      compact,
      useHoverBackground,
      fontSize: compact ? cozyTheme.typography.scale.sm : cozyTheme.typography.scale.md,
    });
  }

  createActionSlotBackground() {
    return this.scene.add.container(0, 0);
  }

  /**
   * @param {number} contentX
   * @param {number} bottomY
   * @param {number} railContentW
   * @param {number} actionCell
   * @param {number} cellGap
   * @param {number} railInnerPad
   */
  _layoutFantasyBottomBar(contentX, bottomY, railContentW, actionCell, cellGap, railInnerPad) {
    const df = cozyTheme.darkFantasy;
    const trayW = railContentW;

    const leftRailW = 4 * df.sideButtonW + 3 * df.sideButtonGap;
    const rightRailW = 3 * df.sideButtonW + 2 * df.sideButtonGap;
    const barsRowH = df.barHeight;
    const actionRowH = railInnerPad * 2 + actionCell;
    const innerContentH = barsRowH + df.barsToSlotsGap + actionRowH;
    const trayH = df.trayPad * 2 + innerContentH;
    const dividerH = innerContentH;

    const centerX =
      df.trayPad + leftRailW + df.railGap + df.dividerW + df.railGap;
    const centerW = Math.max(
      120,
      trayW - centerX - df.railGap - df.dividerW - df.railGap - rightRailW - df.trayPad,
    );

    this.bottomBarHeight = trayH;
    this._bottomTrayBounds = { x: contentX, y: bottomY, width: trayW, height: trayH };

    this._bottomChrome.root.setPosition(contentX, bottomY);
    this._bottomChrome.root.setVisible(this._bottomVisible);

    drawStonePanel(this._bottomChrome.frameG, trayW, trayH);

    const trayInnerX = df.trayPad;
    const trayInnerY = df.trayPad;
    const actionRowY = barsRowH + df.barsToSlotsGap;

    this._bottomChrome.leftRail.setPosition(trayInnerX, trayInnerY + actionRowY);
    let lx = 0;
    for (const btn of this._leftUtilityButtons) {
      btn.container.setPosition(lx, 0);
      lx += df.sideButtonW + df.sideButtonGap;
    }

    const leftDivX = trayInnerX + leftRailW + df.railGap;
    drawVerticalDivider(this._bottomChrome.leftDivider, dividerH);
    this._bottomChrome.leftDivider.setPosition(leftDivX, trayInnerY);

    this._bottomChrome.centerPanel.setPosition(centerX, trayInnerY);

    const barW = Math.min(df.resourceBarWidth, Math.floor((centerW - df.barsGap) / 2));
    this._bottomChrome.livesBar.container.setPosition(0, 0);
    this._bottomChrome.goldBar.container.setPosition(barW + df.barsGap, 0);

    this._bottomChrome.pageSelector.container.setPosition(0, actionRowY);
    const actionHostX = this._bottomChrome.pageSelector.width + 4;
    this._bottomChrome.actionHost.setPosition(actionHostX, actionRowY);

    const rightDivX = centerX + centerW + df.railGap;
    drawVerticalDivider(this._bottomChrome.rightDivider, dividerH);
    this._bottomChrome.rightDivider.setPosition(rightDivX, trayInnerY);

    this._bottomChrome.rightRail.setPosition(rightDivX + df.dividerW + df.railGap, trayInnerY + actionRowY);
    let rx = 0;
    for (const btn of this._rightUtilityButtons) {
      btn.container.setPosition(rx, 0);
      rx += df.sideButtonW + df.sideButtonGap;
    }

    const gridCols = ACTION_GRID_COLS;
    const railW = gridCols * (actionCell + cellGap) - cellGap + 2 * railInnerPad;
    const railH = railInnerPad * 2 + actionCell;
    this._actionGridBackground.setScale(1);
    this._actionGridBackground.setPosition(0, 0);
    this._actionStripBounds = {
      x: contentX + centerX + actionHostX,
      y: bottomY + trayInnerY + actionRowY,
      width: railW,
      height: railH,
    };

    const goldBarScreenX = contentX + centerX + barW + df.barsGap;
    const goldBarScreenY = bottomY + trayInnerY;
    this._goldBarScreenPos = { x: goldBarScreenX, y: goldBarScreenY };

    const menuBtnScreenX = contentX + trayInnerX + df.sideButtonW / 2;
    const menuBtnScreenY = bottomY + trayInnerY + actionRowY + df.sideButtonH / 2;
    this._bottomMenuAnchor = { x: menuBtnScreenX, y: menuBtnScreenY };

    return { trayH, centerX, trayInnerY, actionRowY, actionHostX };
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
      const contentWidth = Math.min(rootWidth - 16, 980);
      const contentX = Math.round((rootWidth - contentWidth) * 0.5);
      const isPortrait = this._viewportMode !== "landscape";
      const splitLandscape = !isPortrait && rootWidth >= 920 && this._bottomVisible;
      const topHeight = this.clamp(Math.round(rootHeight * (isPortrait ? 0.08 : 0.095)), 56, 78);
      this.topBarHeight = topHeight;

      const panelPadding = 16;
      const gapSm = 8;
      const controlRowH = 44;
      const df = cozyTheme.darkFantasy;
      const railInnerPad = df.railInnerPad;
      const cellGap = df.slotGap;
      const isWaveCtx = SHOW_CONTEXT_PANEL && this._contextMode === "wave";
      const isTowerCtx = SHOW_CONTEXT_PANEL && this._contextMode === "tower";
      const rightPanelW = SHOW_CONTEXT_PANEL && splitLandscape
        ? this.clamp(
            Math.round(contentWidth * 0.34),
            cozyTheme.hud.landscapeSidePanelMinWidth ?? 280,
            cozyTheme.hud.landscapeSidePanelMaxWidth ?? 380,
          )
        : 0;
      const railContentW = Math.max(220, contentWidth - rightPanelW - (splitLandscape ? gapSm : 0));
      const waveStripH = splitLandscape ? 0 : this._bottomVisible && isWaveCtx ? 125 : 0;
      const towerSummaryEstimate = splitLandscape ? 0 : this._bottomVisible && isTowerCtx ? 200 : 0;
      const maxRailW = railContentW - panelPadding * 2;
      const actionCell = this.clamp(
        Math.floor((maxRailW - 2 * railInnerPad - (ACTION_GRID_COLS - 1) * cellGap) / ACTION_GRID_COLS),
        cozyTheme.darkFantasy.slotSize,
        cozyTheme.darkFantasy.slotSize + 8,
      );
      const railRowsEst = this._bottomVisible ? ACTION_GRID_ROWS : 0;
      const actionStripH = this._bottomVisible
        ? railInnerPad * 2 + railRowsEst * (actionCell + cellGap) - cellGap
        : 0;
      const fantasyTrayEst =
        df.trayPad * 2 +
        df.barHeight +
        df.barsToSlotsGap +
        railInnerPad * 2 +
        actionCell;
      let totalBottom =
        panelPadding * 2 +
        waveStripH +
        (waveStripH ? gapSm : 0) +
        towerSummaryEstimate +
        (towerSummaryEstimate ? gapSm : 0) +
        fantasyTrayEst +
        gapSm +
        controlRowH;
      const bottomHeight = splitLandscape
        ? this.clamp(fantasyTrayEst + panelPadding * 2 + 12, fantasyTrayEst, 120)
        : this.clamp(
            totalBottom,
            fantasyTrayEst,
            Math.round(rootHeight * (isPortrait ? 0.18 : 0.16)),
          );
      this.bottomBarHeight = bottomHeight;
      this._effectiveBottomChromeHeight = 0;
      this._effectiveRightChromeWidth = splitLandscape ? rightPanelW + panelPadding : 0;

      const statFontSize = this.clamp(Math.round(topHeight * 0.36), 19, 24);
      this.speedButton.setStyle({ fontSize: "14px", padding: { x: 8, y: 8 } });
      this.pauseButton.setStyle({ fontSize: "14px", padding: { x: 8, y: 8 } });
      this.hpText.setStyle({ fontSize: `${statFontSize}px` });
      this.goldText.setStyle({ fontSize: `${statFontSize}px` });
      this.towersText.setStyle({ fontSize: `${statFontSize}px` });
      this.cameraTelemetryText.setStyle({ fontSize: `${this.clamp(Math.round(topHeight * 0.28), 12, 16)}px` });

      const landscapeContextScale = Number(cozyTheme.hud.landscapeContextScale) || 0.9;
      const contextTitleSize = splitLandscape
        ? this.clamp(Math.round(topHeight * 0.34 * landscapeContextScale), 14, 19)
        : this.clamp(Math.round(bottomHeight * 0.13), 15, 24);
      const contextInfoSize = splitLandscape
        ? this.clamp(Math.round(topHeight * 0.28 * landscapeContextScale), 12, 16)
        : this.clamp(Math.round(bottomHeight * 0.1), 12, 18);
      const contextSubSize = splitLandscape
        ? this.clamp(Math.round(topHeight * 0.23 * landscapeContextScale), 11, 14)
        : this.clamp(Math.round(bottomHeight * 0.085), 11, 16);
      this.contextTitleText.setStyle({ fontSize: `${contextTitleSize}px` });
      this.contextSubtitleText.setStyle({ fontSize: `${contextSubSize}px` });
      this.waveCountText.setStyle({ fontSize: `${contextInfoSize}px` });
      this.waveEnemiesText.setStyle({ fontSize: `${contextInfoSize}px` });
      this.upcomingEnemiesTitleText.setStyle({ fontSize: `${contextSubSize}px` });
      this.upcomingCurrentNowText.setStyle({ fontSize: `${this.clamp(contextSubSize - 1, 9, 12)}px` });
      this.upcomingCurrentRoleText.setStyle({ fontSize: `${contextSubSize}px` });
      this.upcomingNextNowText.setStyle({ fontSize: `${this.clamp(contextSubSize - 1, 9, 12)}px` });
      this.upcomingNextRoleText.setStyle({ fontSize: `${contextSubSize}px` });
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

      this.topBackground.setVisible(false);
      const activeBottomHeight = this._bottomVisible ? this.bottomBarHeight : 0;

      const centerY = this.topBarHeight / 2;
      const useBottomResources = this._bottomVisible;
      this.hpText.setVisible(this._topVisible && !useBottomResources);
      this.goldText.setVisible(this._topVisible && !useBottomResources);
      this.speedButton.setVisible(this._topVisible && !useBottomResources);
      this.pauseButton.setVisible(this._topVisible && !useBottomResources);
      const leftPadding = contentX + FLOATING_MENU_PAD;
      if (this._topVisible) {
        this.menuButton.setPosition(leftPadding, FLOATING_MENU_PAD);
      }
      this.speedButton.setPosition(leftPadding + (this._editorMenuButton?.width ?? 36) + gapSm, centerY);
      this.pauseButton.setPosition(this.speedButton.x + this.speedButton.width + gapSm, centerY);

      const menuPad = 8;
      const menuWidth = this.clamp(Math.round(contentWidth * 0.5), 280, 380);
      const showMapEditor = this.isDebugPanelVisible();
      const menuRowCount = showMapEditor ? 3 : 2;
      const menuHeight = this.clamp(
        menuRowCount === 3 ? 150 : 110,
        menuRowCount === 3 ? 130 : 96,
        menuRowCount === 3 ? 200 : 160,
      );
      const menuInset = 14;
      const menuRowH = 36;
      const menuRowW = menuWidth - menuInset * 2;
      this.menuDropdownPanel.setSize(menuWidth, menuHeight);
      this.menuBtnMapEditor.setSize(menuRowW, menuRowH);
      this.menuBtnSettings.setSize(menuRowW, menuRowH);
      this.menuBtnMainMenu.setSize(menuRowW, menuRowH);
      const itemGap = Math.max(6, Math.round((menuHeight - menuInset * 2 - menuRowH * menuRowCount) / Math.max(1, menuRowCount - 1)));
      const itemStartY = menuInset;
      this.menuBtnMapEditor.setVisible(showMapEditor);
      if (showMapEditor) {
        this.menuBtnMapEditor.setPosition(menuInset, itemStartY);
        this.menuBtnSettings.setPosition(menuInset, itemStartY + menuRowH + itemGap);
        this.menuBtnMainMenu.setPosition(menuInset, itemStartY + (menuRowH + itemGap) * 2);
      } else {
        this.menuBtnSettings.setPosition(menuInset, itemStartY);
        this.menuBtnMainMenu.setPosition(menuInset, itemStartY + menuRowH + itemGap);
      }

      const positionMenuDropdown = () => {
        if (this._topVisible) {
          this.menuBackdrop.setPosition(contentX, 0);
          this.menuBackdrop.setSize(contentWidth, rootHeight);
          const menuH = this._editorMenuButton?.height ?? df.sideButtonH;
          const dropY = this.menuButton.y + menuH + menuPad;
          this.menuDropdownRoot.setPosition(this.menuButton.x, dropY);
        } else if (this._bottomMenuAnchor) {
          this.menuBackdrop.setPosition(contentX, 0);
          this.menuBackdrop.setSize(contentWidth, rootHeight);
          const anchor = this._bottomMenuAnchor;
          const dropY = anchor.y - menuHeight - menuPad;
          this.menuDropdownRoot.setPosition(
            this.clamp(anchor.x, contentX + 8, contentX + contentWidth - menuWidth - 8),
            Math.max(8, dropY),
          );
        }
      };

      const rightPadding = contentX + railContentW - 12;
      const statGap = 16;
      this.towersText.setPosition(rightPadding, centerY);
      this.hpText.setOrigin(1, 0.5);
      this.goldText.setPosition(rightPadding, centerY);
      this.hpText.setPosition(this.goldText.x - statGap - this.hpText.width, centerY);
      if (this._goldBarScreenPos && useBottomResources) {
        this.goldDeltaText.setPosition(
          this._goldBarScreenPos.x + this._bottomChrome.goldBar.width + 8,
          this._goldBarScreenPos.y + this._bottomChrome.goldBar.height / 2,
        );
      } else {
        this.goldDeltaText.setPosition(this.goldText.x + 8, centerY - Math.max(10, Math.round(topHeight * 0.28)));
      }
      this.cameraTelemetryText.setOrigin(0, 0.5);
      const cameraAnchor =
        useBottomResources && this._bottomMenuAnchor
          ? {
              x: this._bottomMenuAnchor.x - df.sideButtonW / 2,
              width: df.sideButtonW,
              y: this._bottomMenuAnchor.y,
            }
          : this.pauseButton;
      const cameraTextLeft = cameraAnchor.x + cameraAnchor.width + gapSm + 6;
      const cameraTextRight = useBottomResources
        ? rightPadding - statGap
        : this.hpText.x - gapSm;
      const cameraTextX = this.clamp(cameraTextLeft, cameraTextLeft, Math.max(cameraTextLeft, cameraTextRight));
      const cameraTextY =
        useBottomResources && this._bottomMenuAnchor ? this._bottomMenuAnchor.y : centerY;
      this.cameraTelemetryText.setPosition(cameraTextX, cameraTextY);
      const debugPad = 8;
      const debugTop =
        (this._topVisible ? (this._editorMenuButton?.height ?? df.sideButtonH) + FLOATING_MENU_PAD : 0) +
        debugPad;
      this.debugPanelRoot.setPosition(contentX + debugPad, debugTop);
      this._refreshDebugTelemetryText();

      let bottomY = Math.max(0, rootHeight - activeBottomHeight);
      if (this._bottomVisible) {
        this._layoutFantasyBottomBar(contentX, bottomY, railContentW, actionCell, cellGap, railInnerPad);
        bottomY = Math.max(0, rootHeight - this.bottomBarHeight);
        if (bottomY !== Math.max(0, rootHeight - activeBottomHeight)) {
          this._layoutFantasyBottomBar(contentX, bottomY, railContentW, actionCell, cellGap, railInnerPad);
        }
      } else {
        this._bottomChrome.root.setVisible(false);
        this._bottomTrayBounds = { x: 0, y: 0, width: 0, height: 0 };
      }
      positionMenuDropdown();
      const contextPanelW = splitLandscape ? rightPanelW - panelPadding : railContentW - panelPadding * 2;
      const contextPad = 12;
      let yCursor = bottomY + panelPadding;
      const contextBaseX = splitLandscape ? contentX + railContentW + gapSm + panelPadding : contentX + panelPadding;
      const splitPanelTop = splitLandscape ? this.topBarHeight + panelPadding : yCursor;
      const splitPanelBottomLimit = splitLandscape ? bottomY - panelPadding : rootHeight - panelPadding;
      const splitPanelH = splitLandscape ? Math.max(125, splitPanelBottomLimit - splitPanelTop) : 0;

      if (splitLandscape && this._bottomVisible) {
        this.contextPanelFrame.setPosition(contextBaseX, splitPanelTop);
        this.contextPanelFrame.setSize(contextPanelW, splitPanelH);
        this.contextTitleText.setPosition(this.contextPanelFrame.x + contextPad, this.contextPanelFrame.y + contextPad + 1);
        this.contextSubtitleText.setPosition(
          this.contextTitleText.x,
          this.contextTitleText.y + this.contextTitleText.height + 4,
        );
        if (isWaveCtx) {
          const waveBodyTop = this.contextTitleText.y + this.contextTitleText.height + WAVE_TITLE_TO_BODY_GAP;
          this.waveEnemiesText.setPosition(this.contextTitleText.x, waveBodyTop);
          const progressTrackY = this.waveEnemiesText.y + this.waveEnemiesText.height + 8;
          const progressTrackW = Math.max(90, contextPanelW - contextPad * 2);
          const progressTrackH = 14;
          this.waveProgressTrack.setPosition(this.contextPanelFrame.x + contextPad, progressTrackY);
          this.waveProgressTrack.setSize(progressTrackW, progressTrackH);
          this.waveProgressText.setPosition(this.waveProgressTrack.x, this.waveProgressTrack.y + this.waveProgressTrack.height + 6);
          this.upcomingEnemiesTitleText.setPosition(this.contextPanelFrame.x + contextPad, this.waveProgressText.y + this.waveProgressText.height + 8);
          const chipTop = this.upcomingEnemiesTitleText.y + this.upcomingEnemiesTitleText.height + 6;
          const previewGap = 16;
          const previewCardSize = this.clamp(
            Math.floor((contextPanelW - contextPad * 2 - previewGap) / 2),
            56,
            128,
          );
          this._previewIconSize = Math.round(previewCardSize * 0.78);
          const previewLabelSize = this.clamp(Math.round(previewCardSize * 0.22), 12, 18);
          const previewNowSize = this.clamp(previewLabelSize - 2, 9, 14);
          this.upcomingCurrentNowText.setStyle({ fontSize: `${previewNowSize}px` });
          this.upcomingCurrentRoleText.setStyle({ fontSize: `${previewLabelSize}px` });
          this.upcomingNextNowText.setStyle({ fontSize: `${previewNowSize}px` });
          this.upcomingNextRoleText.setStyle({ fontSize: `${previewLabelSize}px` });
          this.upcomingCurrentIconBg.setSize(previewCardSize, previewCardSize);
          this.upcomingNextIconBg.setSize(previewCardSize, previewCardSize);
          this.upcomingCurrentIconBg.setPosition(this.contextPanelFrame.x + contextPad, chipTop);
          this.upcomingCurrentIcon.setPosition(
            this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width / 2,
            this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height / 2,
          );
          if (this.upcomingCurrentIcon.visible) {
            this.upcomingCurrentIcon.setDisplaySize(this._previewIconSize, this._previewIconSize);
          }
          const cornerInset = 4;
          this.upcomingCurrentNowText.setPosition(
            this.upcomingCurrentIconBg.x + cornerInset,
            this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height - cornerInset,
          );
          this.upcomingCurrentRoleText.setPosition(
            this.upcomingCurrentIconBg.x,
            this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height + WAVE_PREVIEW_ROLE_GAP,
          );
          const nextX = this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width + previewGap;
          this.upcomingNextIconBg.setPosition(nextX, chipTop);
          this.upcomingNextIcon.setPosition(
            this.upcomingNextIconBg.x + this.upcomingNextIconBg.width / 2,
            this.upcomingNextIconBg.y + this.upcomingNextIconBg.height / 2,
          );
          if (this.upcomingNextIcon.visible) {
            this.upcomingNextIcon.setDisplaySize(this._previewIconSize, this._previewIconSize);
          }
          this.upcomingNextNowText.setPosition(
            this.upcomingNextIconBg.x + cornerInset,
            this.upcomingNextIconBg.y + this.upcomingNextIconBg.height - cornerInset,
          );
          this.upcomingNextRoleText.setPosition(
            this.upcomingNextIconBg.x,
            this.upcomingNextIconBg.y + this.upcomingNextIconBg.height + WAVE_PREVIEW_ROLE_GAP,
          );
          this.setWaveProgressVisual(this._waveInfo?.progress);
        } else if (isTowerCtx) {
          const iconSize = 52;
          this.towerCardIconBg.setSize(iconSize, iconSize);
          const iconY = this.contextSubtitleText.y + this.contextSubtitleText.height + 8;
          this.towerCardIconBg.setPosition(this.contextPanelFrame.x + contextPad, iconY);
          this.towerCardIcon.setPosition(
            this.towerCardIconBg.x + this.towerCardIconBg.width / 2,
            this.towerCardIconBg.y + this.towerCardIconBg.height / 2,
          );
          this.applyTowerIcon(this.towerCardIcon, this._selectedBuilding?.iconKey);
          const towerContentX = this.towerCardIconBg.x + this.towerCardIconBg.width + 10;
          const textColW = Math.max(110, contextPanelW - (towerContentX - this.contextPanelFrame.x) - contextPad);
          this.towerRolePrimaryText.setWordWrapWidth(textColW, true);
          this.towerDpsText.setWordWrapWidth(textColW, true);
          this.towerRangeText.setWordWrapWidth(textColW, true);
          this.towerEffectText.setWordWrapWidth(textColW, true);
          let statY = this.towerCardIconBg.y;
          if (this.towerRolePrimaryText.visible && (this.towerRolePrimaryText.text?.length ?? 0) > 0) {
            this.towerRolePrimaryText.setPosition(towerContentX, statY);
            statY += this.towerRolePrimaryText.height + 4;
          } else {
            this.towerRolePrimaryText.setPosition(towerContentX, statY);
          }
          this.towerDpsText.setPosition(towerContentX, statY);
          statY += this.towerDpsText.height + 4;
          this.towerRangeText.setPosition(towerContentX, statY);
          statY += this.towerRangeText.height + 4;
          this.towerRangeTrack.setPosition(towerContentX, statY);
          this.towerRangeTrack.setSize(textColW, 8);
          this.towerRangeFill.setPosition(this.towerRangeTrack.x + 1, this.towerRangeTrack.y + 1);
          this.towerEffectText.setPosition(towerContentX, this.towerRangeTrack.y + this.towerRangeTrack.height + 6);
          const tr = Number(this._selectedBuilding?.range);
          if (Number.isFinite(tr)) {
            this.setTowerRangeVisual(tr);
          }
        }
      } else if (this._bottomVisible && isWaveCtx && waveStripH > 0) {
        const wavePanelH = waveStripH;
        this.contextPanelFrame.setSize(contextPanelW, wavePanelH);
        this.contextPanelFrame.setPosition(contextBaseX, yCursor);
        this.contextTitleText.setPosition(this.contextPanelFrame.x + contextPad, this.contextPanelFrame.y + contextPad + 2);
        this.contextSubtitleText.setPosition(
          this.contextTitleText.x,
          this.contextTitleText.y + this.contextTitleText.height + 4,
        );
        const waveBodyTop = this.contextTitleText.y + this.contextTitleText.height + WAVE_TITLE_TO_BODY_GAP;
        this.waveEnemiesText.setPosition(this.contextTitleText.x, waveBodyTop);
        const progressTrackY = this.waveEnemiesText.y + this.waveEnemiesText.height + 4;
        const progressTrackW = Math.max(70, contextPanelW - contextPad * 2);
        const progressTrackH = this.clamp(Math.round(wavePanelH * 0.1), 10, 14);
        this.waveProgressTrack.setPosition(this.contextPanelFrame.x + contextPad, progressTrackY);
        this.waveProgressTrack.setSize(progressTrackW, progressTrackH);
        this.waveProgressText.setStyle({ fontSize: `${this.clamp(Math.round(progressTrackH * 0.95), 11, 14)}px` });
        this.waveProgressText.setPosition(
          this.waveProgressTrack.x,
          this.waveProgressTrack.y + this.waveProgressTrack.height + 4,
        );
        const chipY = this.waveProgressText.y + this.waveProgressText.height + 4;
        this.upcomingEnemiesTitleText.setPosition(this.contextPanelFrame.x + contextPad, chipY);
        const chipTop = this.upcomingEnemiesTitleText.y + this.upcomingEnemiesTitleText.height + 6;
        const previewCardSize = 52;
        this._previewIconSize = 44;
        const previewLabelSize = this.clamp(Math.round(previewCardSize * 0.22), 11, 14);
        const previewNowSize = this.clamp(previewLabelSize - 1, 9, 12);
        this.upcomingCurrentNowText.setStyle({ fontSize: `${previewNowSize}px` });
        this.upcomingCurrentRoleText.setStyle({ fontSize: `${previewLabelSize}px` });
        this.upcomingNextNowText.setStyle({ fontSize: `${previewNowSize}px` });
        this.upcomingNextRoleText.setStyle({ fontSize: `${previewLabelSize}px` });
        this.upcomingCurrentIconBg.setSize(previewCardSize, previewCardSize);
        this.upcomingNextIconBg.setSize(previewCardSize, previewCardSize);
        this.upcomingCurrentIconBg.setPosition(this.contextPanelFrame.x + contextPad, chipTop);
        this.upcomingCurrentIcon.setPosition(
          this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width / 2,
          this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height / 2,
        );
        if (this.upcomingCurrentIcon.visible) {
          this.upcomingCurrentIcon.setDisplaySize(this._previewIconSize, this._previewIconSize);
        }
        const cornerInset = 4;
        this.upcomingCurrentNowText.setPosition(
          this.upcomingCurrentIconBg.x + cornerInset,
          this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height - cornerInset,
        );
        this.upcomingCurrentRoleText.setPosition(
          this.upcomingCurrentIconBg.x,
          this.upcomingCurrentIconBg.y + this.upcomingCurrentIconBg.height + WAVE_PREVIEW_ROLE_GAP,
        );
        const nextX =
          this.upcomingCurrentIconBg.x + this.upcomingCurrentIconBg.width + Math.max(10, Math.round(contextPad * 0.45));
        this.upcomingNextIconBg.setPosition(nextX, chipTop);
        this.upcomingNextIcon.setPosition(
          this.upcomingNextIconBg.x + this.upcomingNextIconBg.width / 2,
          this.upcomingNextIconBg.y + this.upcomingNextIconBg.height / 2,
        );
        if (this.upcomingNextIcon.visible) {
          this.upcomingNextIcon.setDisplaySize(this._previewIconSize, this._previewIconSize);
        }
        this.upcomingNextNowText.setPosition(
          this.upcomingNextIconBg.x + cornerInset,
          this.upcomingNextIconBg.y + this.upcomingNextIconBg.height - cornerInset,
        );
        this.upcomingNextRoleText.setPosition(
          this.upcomingNextIconBg.x,
          this.upcomingNextIconBg.y + this.upcomingNextIconBg.height + WAVE_PREVIEW_ROLE_GAP,
        );
        this.setWaveProgressVisual(this._waveInfo?.progress);
        yCursor += wavePanelH + gapSm;
      } else if (this._bottomVisible && isTowerCtx) {
        const towerPanelTop = yCursor;
        this.contextPanelFrame.setPosition(contentX + panelPadding, towerPanelTop);
        this.contextPanelFrame.setSize(contextPanelW, towerSummaryEstimate);
        this.contextTitleText.setPosition(this.contextPanelFrame.x + contextPad, this.contextPanelFrame.y + contextPad);
        this.contextSubtitleText.setPosition(
          this.contextTitleText.x,
          this.contextTitleText.y + this.contextTitleText.height + 4,
        );
        const iconSize = 56;
        this.towerCardIconBg.setSize(iconSize, iconSize);
        const iconY = this.contextSubtitleText.y + this.contextSubtitleText.height + 8;
        this.towerCardIconBg.setPosition(this.contextPanelFrame.x + contextPad, iconY);
        this.towerCardIcon.setPosition(
          this.towerCardIconBg.x + this.towerCardIconBg.width / 2,
          this.towerCardIconBg.y + this.towerCardIconBg.height / 2,
        );
        this.applyTowerIcon(this.towerCardIcon, this._selectedBuilding?.iconKey);
        const towerContentX = this.towerCardIconBg.x + this.towerCardIconBg.width + 12;
        const textColW = Math.max(120, contextPanelW - (towerContentX - this.contextPanelFrame.x) - contextPad);
        this.towerNameTierText.setVisible(false);
        this.towerRolePrimaryText.setWordWrapWidth(textColW, true);
        this.towerDpsText.setWordWrapWidth(textColW, true);
        this.towerRangeText.setWordWrapWidth(textColW, true);
        this.towerEffectText.setWordWrapWidth(textColW, true);
        let statY = this.towerCardIconBg.y;
        if (this.towerRolePrimaryText.visible && (this.towerRolePrimaryText.text?.length ?? 0) > 0) {
          this.towerRolePrimaryText.setPosition(towerContentX, statY);
          statY += this.towerRolePrimaryText.height + 4;
        } else {
          this.towerRolePrimaryText.setPosition(towerContentX, statY);
        }
        this.towerDpsText.setPosition(towerContentX, statY);
        statY += this.towerDpsText.height + 4;
        this.towerRangeText.setPosition(towerContentX, statY);
        statY += this.towerRangeText.height + 4;
        this.towerRangeTrack.setPosition(towerContentX, statY);
        this.towerRangeTrack.setSize(textColW, 8);
        this.towerRangeFill.setPosition(this.towerRangeTrack.x + 1, this.towerRangeTrack.y + 1);
        this.towerEffectText.setPosition(towerContentX, this.towerRangeTrack.y + this.towerRangeTrack.height + 6);
        const towerBottom = Math.max(
          this.towerCardIconBg.y + this.towerCardIconBg.height,
          this.towerEffectText.y + this.towerEffectText.height,
        );
        const towerSummaryMeasured = Math.ceil(towerBottom - this.contextPanelFrame.y + contextPad);
        this.contextPanelFrame.setSize(contextPanelW, Math.max(96, towerSummaryMeasured));
        yCursor += this.contextPanelFrame.height + gapSm;
        const tr = Number(this._selectedBuilding?.range);
        if (Number.isFinite(tr)) {
          this.setTowerRangeVisual(tr);
        }
      }
      const contentCellW = actionCell;
      const contentCellH = actionCell;
      const actionFontSize = 14;

      const edgeRects = this._getVisiblePanelRects();
      this._effectiveRightChromeWidth = 0;
      this._effectiveBottomChromeHeight = 0;
      this._effectiveLeftChromeWidth = 0;
      const edgeSnap = 6;
      for (const rect of edgeRects) {
        if (!rect) {
          continue;
        }
        const rightGap = rootWidth - (rect.x + rect.width);
        const leftGap = rect.x;
        const bottomGap = rootHeight - (rect.y + rect.height);
        if (rightGap <= edgeSnap) {
          this._effectiveRightChromeWidth = Math.max(this._effectiveRightChromeWidth, rootWidth - rect.x);
        }
        if (leftGap <= edgeSnap) {
          this._effectiveLeftChromeWidth = Math.max(this._effectiveLeftChromeWidth, rect.x + rect.width);
        }
        if (bottomGap <= edgeSnap) {
          this._effectiveBottomChromeHeight = Math.max(this._effectiveBottomChromeHeight, rootHeight - rect.y);
        }
      }

      for (let i = 0; i < this._actionButtons.length; i += 1) {
        const slot = this._actionSlotConfigs[i];
        const isEmptyFrame = !slot;
        let slotLeft = 0;
        let slotTop = 0;
        let centerX = 0;
        let centerY = 0;
        if (this._bottomVisible) {
          const col = i;
          slotLeft = railInnerPad + col * (contentCellW + cellGap);
          slotTop = railInnerPad;
          centerX = slotLeft + contentCellW / 2;
          centerY = slotTop + contentCellH / 2;
        }
        const icon = this._actionIcons[i];
        const slotFrame = this._actionSlotFrames[i];
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
        if (slotFrame) {
          if (slotFrame.size !== contentCellW) {
            slotFrame.setSize(contentCellW);
          }
          const actionId = GRID_KEYBIND_ACTION_IDS[i];
          if (actionId && this.keybindStore && slot) {
            slotFrame.setKeybindLabel(formatKeyLabel(this.keybindStore.getCode(actionId)));
          } else {
            slotFrame.setKeybindLabel("");
          }
          this._syncActionSlotKeybindLayer(
            slotFrame,
            slotLeft,
            slotTop,
            contentCellW,
            contentCellH,
            this._bottomVisible && Boolean(slot),
          );
          slotFrame.container
            .setPosition(slotLeft, slotTop)
            .setVisible(this._bottomVisible);
          if (isEmptyFrame) {
            slotFrame.setEmpty(true);
            slotFrame.setState("regular");
          } else {
            slotFrame.setEmpty(false);
            slotFrame.setGlowColor(accentColor, slot?.enabled === false ? 0.18 : 0.34);
            slotFrame.setState("regular");
          }
        }
        if (currentIcon) {
          const offsetX = slot?.iconOffsetX ?? 0;
          const offsetY = slot?.iconOffsetY ?? 0;
          currentIcon
            .setVisible(Boolean(slot))
            .setPosition(centerX + offsetX, centerY + offsetY)
            .setDisplaySize(iconSize, iconSize)
            .setAlpha(slot?.enabled === false ? 0.5 : 1);
        }

        const button = this._actionButtons[i];
        const hitZone = this._actionHitZones[i];
        const hitSize = contentCellW;
        hitZone
          .setPosition(centerX, centerY)
          .setSize(hitSize, hitSize)
          .setVisible(Boolean(slot));

        const showInlineLabel = Boolean(slot?.label) && this._hoveredActionIndex === i && !this.hasActionTooltip(slot);
        button
          .setPosition(centerX, centerY)
          .setVisible(Boolean(slot))
          .setText(showInlineLabel ? slot.label : "")
          .setStyle({ fontSize: `${actionFontSize}px`, padding: { x: 6, y: 5 } });

        if (slot && slot.cost != null) {
          costText
            .setVisible(true)
            .setPosition(slotLeft + 4, slotTop + 4)
            .setText(`${slot.cost}g`)
            .setAlpha(slot.enabled === false ? 0.7 : 1);
        } else {
          costText.setVisible(false);
        }

        const showInfo = Boolean(slot && slot.showInfoButton !== false && this.hasActionTooltip(slot));
        infoText
          .setVisible(showInfo)
          .setPosition(centerX + contentCellW / 2 - 10, centerY - contentCellH / 2 + 10)
          .setAlpha(slot?.enabled === false ? 0.7 : 1);
        infoZone
          .setPosition(infoText.x, infoText.y)
          .setSize(22, 22)
          .setVisible(showInfo);

        if (currentIcon && showInlineLabel) {
          button.setOrigin(1, 0.5);
          button.setX(centerX - iconSize / 2 - 8);
          button.setStyle({ fontSize: `13px`, color: "#ffffff", stroke: "#000000", strokeThickness: 3 });
        } else {
          button.setOrigin(0.5, 0.5);
        }
      }
      for (const z of this._actionHitZones) {
        this._actionGridBackground.bringToTop(z);
      }
      for (const infoZone of this._actionInfoHitZones) {
        this._actionGridBackground.bringToTop(infoZone);
      }
      for (const slotFrame of this._actionSlotFrames) {
        const keybindText = slotFrame?.keybindText;
        if (keybindText?.visible) {
          this._actionGridBackground.bringToTop(keybindText);
        }
      }
      for (const costText of this._actionCostTexts) {
        this._actionGridBackground.bringToTop(costText);
      }
      for (const infoText of this._actionInfoTexts) {
        this._actionGridBackground.bringToTop(infoText);
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
      this.detailsPanel.setPosition(detailsX, detailsY);
      this.detailsPanel.setSize(detailsW, detailsH);
      this.detailsDescriptionText.setWordWrapWidth(detailsW - 32, true);
      this.detailsTitleText.setPosition(detailsX + 14, detailsY + 12);
      this.detailsDescriptionText.setPosition(detailsX + 14, this.detailsTitleText.y + this.detailsTitleText.height + 8);
      this.detailsCostText.setPosition(detailsX + 14, this.detailsDescriptionText.y + this.detailsDescriptionText.height + 8);
      this.detailsWarningText.setPosition(detailsX + 14, this.detailsCostText.y + this.detailsCostText.height + 6);
      this.detailsCloseButton.setPosition(detailsX + detailsW - this._detailsCloseFantasy.width - 8, detailsY + 8);
    } catch (e) {
      console.error("[HUD] Layout error:", e);
    }
  }

  applyVisibilityState() {
    this.topBackground.setVisible(false);
    for (const obj of this.topUiObjects) {
      obj.setVisible(this._topVisible);
    }
    this.applyMenuOverlayVisibility();
    for (const obj of this.bottomUiObjects) {
      obj.setVisible(this._bottomVisible);
    }
    const showContext = SHOW_CONTEXT_PANEL && this._bottomVisible;
    const showWavePanel = showContext && this._contextMode === "wave";
    const showTowerPanel = showContext && this._contextMode === "tower";
    const subtitleVisible =
      showContext && (this.contextSubtitleText.text?.length ?? 0) > 0;
    this.contextPanelFrame.setVisible(showContext);
    this.contextTitleText.setVisible(showContext);
    this.contextSubtitleText.setVisible(subtitleVisible);
    this.waveCountText.setVisible(false);
    this.waveEnemiesText.setVisible(showWavePanel);
    this.waveProgressTrack.setVisible(showWavePanel);
    this.waveProgressSegments.setVisible(showWavePanel);
    this.waveProgressText.setVisible(showWavePanel);
    this.upcomingEnemiesTitleText.setVisible(showWavePanel);
    this.upcomingCurrentIconBg.setVisible(showWavePanel);
    this.upcomingCurrentIcon.setVisible(showWavePanel && this.upcomingCurrentIcon.visible);
    this.upcomingCurrentNowText.setVisible(showWavePanel);
    this.upcomingCurrentRoleText.setVisible(showWavePanel);
    this.upcomingNextIconBg.setVisible(showWavePanel);
    this.upcomingNextIcon.setVisible(showWavePanel && this.upcomingNextIcon.visible);
    this.upcomingNextNowText.setVisible(showWavePanel);
    this.upcomingNextRoleText.setVisible(showWavePanel);
    this.towerCardIconBg.setVisible(showTowerPanel);
    this.towerCardIcon.setVisible(showTowerPanel && this.towerCardIcon.visible);
    this.towerNameTierText.setVisible(false);
    this.towerRolePrimaryText.setVisible(showTowerPanel && (this.towerRolePrimaryText.text?.length ?? 0) > 0);
    this.towerDpsText.setVisible(showTowerPanel);
    this.towerRangeText.setVisible(showTowerPanel);
    this.towerRangeTrack.setVisible(showTowerPanel);
    this.towerRangeFill.setVisible(showTowerPanel);
    this.towerEffectText.setVisible(showTowerPanel && (this.towerEffectText.text?.length ?? 0) > 0);
    const useBottomResources = this._bottomVisible;
    this.speedButton.setVisible(this._topVisible && !useBottomResources);
    this.pauseButton.setVisible(this._topVisible && !useBottomResources);
    this.hpText.setVisible(this._topVisible && !useBottomResources);
    this.goldText.setVisible(this._topVisible && !useBottomResources);
    this._bottomChrome?.root?.setVisible(this._bottomVisible);
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

  setViewportMode(mode = "portrait") {
    this._viewportMode = mode === "landscape" ? "landscape" : "portrait";
  }

  setCameraTelemetry({ zoom, x, y } = {}) {
    const nextZoom = Number(zoom);
    const nextX = Number(x);
    const nextY = Number(y);
    if (Number.isFinite(nextZoom)) {
      this._cameraTelemetry.zoom = nextZoom;
    }
    if (Number.isFinite(nextX)) {
      this._cameraTelemetry.x = nextX;
    }
    if (Number.isFinite(nextY)) {
      this._cameraTelemetry.y = nextY;
    }
    this._refreshDebugTelemetryText();
  }

  toggleDebugPanelVisibility() {
    this.setDebugPanelVisible(!this._debugPanelVisible);
  }

  setDebugPanelVisible(visible) {
    this._debugPanelVisible = Boolean(visible);
    this._refreshDebugTelemetryText();
    this.debugPanelRoot?.setVisible(this._debugPanelVisible);
    this.layout();
  }

  isDebugPanelVisible() {
    return Boolean(this._debugPanelVisible);
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
    const df = cozyTheme.darkFantasy;
    const floatingMenuH = (this._editorMenuButton?.height ?? df.sideButtonH) + FLOATING_MENU_PAD;
    return {
      top: this._topVisible ? floatingMenuH : 0,
      bottom: this._bottomVisible ? this._effectiveBottomChromeHeight : 0,
      left: this._bottomVisible ? this._effectiveLeftChromeWidth : 0,
      right: this._bottomVisible ? this._effectiveRightChromeWidth : 0,
    };
  }

  isPointBlockedByHud(screenX, screenY) {
    const rootScale = Number.isFinite(this.rootScale) && this.rootScale > 0 ? this.rootScale : 1;
    const lx = (screenX - this.rootOffsetX) / rootScale;
    const ly = (screenY - this.rootOffsetY) / rootScale;
    if (this._topVisible && this.menuButton?.visible) {
      const menuW = this._editorMenuButton?.width ?? cozyTheme.darkFantasy.sideButtonW;
      const menuH = this._editorMenuButton?.height ?? cozyTheme.darkFantasy.sideButtonH;
      const inMenu =
        lx >= this.menuButton.x &&
        lx <= this.menuButton.x + menuW &&
        ly >= this.menuButton.y &&
        ly <= this.menuButton.y + menuH;
      if (inMenu) {
        return true;
      }
    }
    if (!this._bottomVisible) {
      return false;
    }
    if (this._detailsSlotIndex >= 0 && this.detailsRoot?.visible) {
      return true;
    }
    if (this._detailsCloseWorldBlockFrame === (this.scene?.sys?.game?.loop?.frame ?? -1)) {
      return true;
    }
    const windows = this._getVisiblePanelRects();
    for (const rect of windows) {
      if (!rect) {
        continue;
      }
      const inRect =
        lx >= rect.x &&
        lx <= rect.x + rect.width &&
        ly >= rect.y &&
        ly <= rect.y + rect.height;
      if (inRect) {
        return true;
      }
    }
    return false;
  }

  render(state, towerCount = 0, maxLives = this.maxLives, selectedBuilding = null, waveInfo = null) {
    this._refreshMenuKeybindLabels();
    this._selectedBuilding = selectedBuilding;
    this._waveInfo = waveInfo;
    const rawSpeed = Number(state.gameSpeed);
    const gameSpeed =
      Number.isFinite(rawSpeed) ? Math.max(1, Math.min(3, Math.round(rawSpeed))) : 1;
    this.speedButton.setText(`x${gameSpeed}`);
    this.applySpeedButtonStyle(gameSpeed);
    this._bottomSpeedButton?.setLabel(`x${gameSpeed}`);
    this.pauseButton.setText(state.paused ? "Resume" : "Pause");
    this._bottomPauseButton?.setLabel(state.paused ? "▶" : "⏸");
    const hpCurrent = Math.max(0, Math.floor(Number(state.lives) || 0));
    const hpMax = Math.max(hpCurrent, Math.floor(Number(maxLives) || hpCurrent));
    this.hpText.setText(`❤ ${hpCurrent}/${hpMax}`);
    const hpRatio = hpMax > 0 ? hpCurrent / hpMax : 1;
    this.hpText.setColor(hpRatio <= 0.25 ? cozyTheme.colors.textDanger : cozyTheme.hud.chipText);
    this._bottomChrome?.livesBar?.setRatio(hpRatio);
    this._bottomChrome?.livesBar?.setLabel(`${hpCurrent}/${hpMax}`);
    const goldAmount = Math.floor(Number(state.gold) || 0);
    const goldRatio = goldAmount <= 0 ? 0 : Math.min(1, goldAmount / 999);
    this._bottomChrome?.goldBar?.setRatio(goldRatio);
    this._bottomChrome?.goldBar?.setLabel(`💰 ${goldAmount}`);
    this.updateGoldDelta(state.gold);
    this.goldText.setText(`💰 ${state.gold}`);
    this.towersText.setVisible(false);
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
      const compactSummary = `Wave ${waveNumber} • ${enemiesAlive} left`;
      this.contextTitleText.setText(compactSummary);
      this.contextSubtitleText.setText("");
      this.waveCountText.setText("");
      this.waveEnemiesText.setText(`Enemies: ${enemiesAlive}  Spawned: ${totalSpawned}/${spawnTarget}`);
      this.upcomingCurrentNowText.setText("Now");
      this.upcomingCurrentRoleText.setText(this.formatRoleLabel(this._waveInfo?.upcoming?.current?.role));
      this.upcomingNextNowText.setText("Next");
      this.upcomingNextRoleText.setText(this.formatRoleLabel(this._waveInfo?.upcoming?.next?.role));
      this.applyPreviewIcon(this.upcomingCurrentIcon, this._waveInfo?.upcoming?.current);
      this.applyPreviewIcon(this.upcomingNextIcon, this._waveInfo?.upcoming?.next);
      this.setWaveProgressVisual(this._waveInfo?.progress);
      return;
    }
    this._contextMode = "tower";
    const selectedCount = Number(selected.selectedCount);
    const hasGroupSelection = Number.isFinite(selectedCount) && selectedCount > 1;
    const tierValue = Number.isFinite(selected.tier) ? selected.tier + 1 : 1;
    this.contextTitleText.setText(`${selected.label} · Tier ${tierValue}`);
    this.contextSubtitleText.setText(
      hasGroupSelection ? `${Math.floor(selectedCount)} selected` : "",
    );
    this.towerNameTierText.setText("");
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
    const rawFx = (selected.effectSummary || "").trim();
    const fxLine = rawFx.length === 0 ? "" : rawFx.length > 64 ? `${rawFx.slice(0, 61)}...` : rawFx;
    this.towerEffectText.setText(fxLine ? `Fx: ${fxLine}` : "");
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
      const iconSize = this._previewIconSize || 44;
      image.setDisplaySize(iconSize, iconSize);
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
    const g = this.waveProgressSegments;
    const track = this.waveProgressTrack;
    if (!g || !track) {
      return;
    }
    const progress = Number.isFinite(rawProgress) ? this.clamp(rawProgress, 0, 1) : 0;
    const pct = Math.round(progress * 100);
    this.waveProgressText.setText(`Progress: ${pct}%`);

    const trackX = track.x + 1;
    const trackY = track.y + 1;
    const innerW = Math.max(4, track.width - 2);
    const innerH = Math.max(4, track.height - 2);
    const n = WAVE_PROGRESS_SEGMENT_COUNT;
    const gap = WAVE_PROGRESS_SEGMENT_GAP;
    const totalGaps = gap * Math.max(0, n - 1);
    const pillW = Math.max(4, (innerW - totalGaps) / n);
    const radius = Math.min(4, innerH / 2);
    const litCount = progress >= 1 ? n : Math.min(n, Math.round(progress * n));

    g.clear();
    g.setPosition(0, 0);
    for (let i = 0; i < n; i += 1) {
      const px = trackX + i * (pillW + gap);
      const py = trackY;
      const filled = i < litCount;
      if (filled) {
        g.fillStyle(0xffe566, 1);
        g.fillRoundedRect(px, py, pillW, innerH, radius);
        g.lineStyle(2, 0x1a0f04, 1);
        g.strokeRoundedRect(px + 1, py + 1, pillW - 2, innerH - 2, Math.max(1, radius - 1));
        g.fillStyle(0xfff5c0, 0.35);
        g.fillRoundedRect(px + 2, py + 2, pillW - 4, innerH * 0.38, Math.max(1, radius - 2));
      } else {
        g.fillStyle(0x2c2438, 1);
        g.fillRoundedRect(px, py, pillW, innerH, radius);
        g.lineStyle(2, darkFantasyPalette.slotBorder, 0.85);
        g.strokeRoundedRect(px + 0.5, py + 0.5, pillW - 1, innerH - 1, radius);
      }
    }
  }

  applySpeedButtonStyle(gameSpeed) {
    if (gameSpeed >= 3) {
      this.speedButton.setStyle({ backgroundColor: "#8a6f58", color: "#fff7dd" });
      return;
    }
    if (gameSpeed === 2) {
      this.speedButton.setStyle({ backgroundColor: "#6a5648", color: "#f6efdc" });
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

  _formatCameraTelemetry() {
    const zoom = Number.isFinite(this._cameraTelemetry.zoom) ? this._cameraTelemetry.zoom : 1;
    const x = Number.isFinite(this._cameraTelemetry.x) ? this._cameraTelemetry.x : 0;
    const y = Number.isFinite(this._cameraTelemetry.y) ? this._cameraTelemetry.y : 0;
    return `Cam z:${zoom.toFixed(2)} x:${Math.round(x)} y:${Math.round(y)}`;
  }

  _formatPanelTelemetry(label, rect, { visible = true } = {}) {
    if (!visible || !rect) {
      return `${label} hidden`;
    }
    return `${label} x:${Math.round(rect.x)} y:${Math.round(rect.y)} w:${Math.round(rect.width)} h:${Math.round(rect.height)}`;
  }

  _refreshDebugTelemetryText() {
    if (!this.debugPanelText || !this.debugPanelBg) {
      return;
    }
    const camLine = this._formatCameraTelemetry();
    const actionLine = this._formatPanelTelemetry("Action", this._actionStripBounds, {
      visible: this._bottomVisible,
    });
    this.debugPanelText.setText(`${camLine}\n${actionLine}`);
    const pad = 8;
    this.debugPanelText.setPosition(pad, pad);
    this.debugPanelBg.setSize(this.debugPanelText.width + pad * 2, this.debugPanelText.height + pad * 2);
    this.debugPanelRoot.setVisible(this._debugPanelVisible);
  }

}
