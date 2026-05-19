import Phaser from "phaser";
import { KEYBIND_ACTION_IDS, KEYBIND_DESCRIPTIONS, KeybindStore, formatKeyLabel } from "../game/input/KeybindStore.js";
import {
  getDisplaySettings,
  getHudScaleChoices,
  setHudScalePreference,
  toggleFullscreenPreferred,
} from "../game/settings/displaySettings.js";
import { cozyTheme } from "../game/ui/CozyTheme";
import {
  createFantasyMenuRow,
  createFantasyPanel,
  darkFantasyPalette,
} from "../game/ui/FantasyHudChrome";

const TAB_ORDER = /** @type {const} */ (["controls", "audio", "display"]);

const TAB_IDLE_BG = "#2e2a3d";
const TAB_ACTIVE_BG = "#3d3550";

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super("settings");
    this._rebindingActionId = null;
    this._rebindKeyHandler = null;
    this._globalKeydown = null;
    this._onSettingsResize = null;
    /** @type {Phaser.GameObjects.Rectangle | null} */
    this._settingsBackdrop = null;
    /** @type {Phaser.GameObjects.Rectangle | null} */
    this._settingsGlow = null;
    /** @type {ReturnType<typeof createFantasyPanel> | null} */
    this._panel = null;
    /** @type {"controls"|"audio"|"display"} */
    this._activeTab = "controls";
  }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.keybindStore = new KeybindStore();
    this._settingsBackdrop = this.add
      .rectangle(0, 0, 100, 100, darkFantasyPalette.trayShadow, 1)
      .setOrigin(0, 0);
    this._settingsGlow = this.add
      .rectangle(0, 0, 100, 100, darkFantasyPalette.trayBase, 0.22)
      .setOrigin(0.5, 0.5);
    this._panel = createFantasyPanel(this);

    this.titleText = this.add.text(0, 0, "Settings", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "42px",
      color: darkFantasyPalette.textPrimary,
    }).setOrigin(0.5, 0.5);

    const mkTab = (label, tabKey) => {
      const t = this.add
        .text(0, 0, label, {
          fontFamily: cozyTheme.typography.titleFamily,
          fontSize: "24px",
          color: darkFantasyPalette.textMuted,
          backgroundColor: TAB_IDLE_BG,
          padding: { x: cozyTheme.spacing.sm, y: cozyTheme.spacing.sm },
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", () => this.setActiveTab(tabKey));
      return t;
    };
    this.tabControls = mkTab("Controls", "controls");
    this.tabAudio = mkTab("Audio", "audio");
    this.tabDisplay = mkTab("Display", "display");

    this.feedbackText = this.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "20px",
      color: darkFantasyPalette.textMuted,
      align: "center",
      wordWrap: { width: 680, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);

    this.audioSoonText = this.add
      .text(0, 0, "Audio settings will arrive in a future update.", {
        fontFamily: cozyTheme.typography.bodyFamily,
        fontSize: "22px",
        color: darkFantasyPalette.textMuted,
        align: "center",
        wordWrap: { width: 640, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.displaySectionLabel = this.add
      .text(0, 0, "Window", {
        fontFamily: cozyTheme.typography.titleFamily,
        fontSize: "20px",
        color: darkFantasyPalette.textMuted,
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.fullscreenBtn = createFantasyMenuRow(this, {
      label: "Toggle fullscreen",
      width: 220,
      height: 36,
      onClick: async () => {
        const r = await toggleFullscreenPreferred();
        if (r.ok) {
          this.setFeedback("Fullscreen toggled.", false);
        } else {
          this.setFeedback(r.reason ?? "Could not toggle fullscreen.", true);
        }
      },
    });
    this.fullscreenBtn.setVisible(false);

    this.hudScaleLabel = this.add
      .text(0, 0, "HUD scale", {
        fontFamily: cozyTheme.typography.titleFamily,
        fontSize: "20px",
        color: darkFantasyPalette.textMuted,
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this._hudScalePickers = [];
    for (const scale of getHudScaleChoices()) {
      const pct = `${Math.round(scale * 100)}%`;
      const row = createFantasyMenuRow(this, {
        label: pct,
        width: 80,
        height: 32,
        onClick: () => {
          setHudScalePreference(scale);
          this._refreshHudScaleTabs();
          this.setFeedback(`HUD scale set to ${pct}.`, false);
        },
      });
      row.setVisible(false);
      this._hudScalePickers.push({ scale, row });
    }

    this.rowButtons = [];
    for (const actionId of KEYBIND_ACTION_IDS) {
      const label = KEYBIND_DESCRIPTIONS[actionId] ?? actionId;
      const rowText = this.add.text(0, 0, "", {
        fontFamily: cozyTheme.typography.bodyFamily,
        fontSize: "20px",
        color: darkFantasyPalette.textMuted,
        wordWrap: { width: 360, useAdvancedWrap: true },
      }).setOrigin(0, 0.5);
      const rowBtn = createFantasyMenuRow(this, {
        label: "Rebind",
        width: 120,
        height: 32,
        onClick: () => this.beginRebind(actionId),
      });
      this.rowButtons.push({ actionId, label, rowText, rowBtn });
    }

    this.backBtn = createFantasyMenuRow(this, {
      label: "Back",
      width: 200,
      height: 40,
      onClick: () => this.goBack(),
    });
    this.resetBtn = createFantasyMenuRow(this, {
      label: "Reset Defaults",
      width: 260,
      height: 40,
      onClick: () => {
        this.keybindStore.resetToDefaults();
        this.setFeedback("Controls reset to defaults.", false);
        this.refreshRows();
      },
    });

    this._globalKeydown = (ev) => {
      if (ev.key === "Escape" && !this._rebindingActionId) {
        this.goBack();
      }
    };
    this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._globalKeydown);

    this._onSettingsResize = () => this.layoutSettingsUi();
    this.scale.on(Phaser.Scale.Events.RESIZE, this._onSettingsResize, this);

    this.layoutSettingsUi();
    this.refreshRows();
    this.setActiveTab(this._activeTab);
  }

  shutdown() {
    if (this._onSettingsResize) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this._onSettingsResize, this);
      this._onSettingsResize = null;
    }
    if (this._globalKeydown) {
      this.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._globalKeydown);
    }
    this.clearRebindHandler();
  }

  layoutSettingsUi() {
    const { width, height } = this.scale;
    const pad = 12;
    const contentWidth = Math.min(width - pad * 2, 800);
    const panelW = Math.min(780, contentWidth - 16);
    const panelH = Math.min(980, Math.max(280, height * 0.92));
    const centerX = width * 0.5;
    const centerY = height * 0.5;

    this._settingsBackdrop?.setPosition(0, 0).setSize(width, height);
    this._settingsGlow?.setPosition(centerX, centerY).setSize(Math.min(contentWidth, width - pad * 2), panelH);
    this._panel?.setSize(panelW, panelH);
    this._panel?.setPosition(centerX - panelW / 2, centerY - panelH / 2);

    const panel = this._panel;
    if (!panel) {
      return;
    }
    const left = panel.x;
    const right = left + panel.width;
    const top = panel.y;
    const bottom = top + panel.height;
    const panelCx = left + panel.width / 2;
    const innerPad = 14;

    const titleSize = Math.max(26, Math.min(48, Math.round(contentWidth * 0.058)));
    this.titleText.setPosition(panelCx, top + 32);
    this.titleText.setStyle({ fontSize: `${titleSize}px` });

    const tabY = top + 62;
    const narrowTabs = panel.width < 520;
    const tabFont = narrowTabs ? "19px" : "24px";
    [this.tabControls, this.tabAudio, this.tabDisplay].forEach((t) => t.setStyle({ fontSize: tabFont }));

    if (!narrowTabs) {
      this.tabControls.setPosition(left + innerPad, tabY);
      this.tabAudio.setPosition(this.tabControls.x + this.tabControls.width + 10, tabY);
      this.tabDisplay.setPosition(this.tabAudio.x + this.tabAudio.width + 10, tabY);
    } else {
      this.tabControls.setPosition(left + innerPad, tabY - 10);
      this.tabAudio.setPosition(this.tabControls.x + this.tabControls.width + 8, tabY - 10);
      this.tabDisplay.setPosition(left + innerPad, tabY + 28);
    }

    const footerH = 120;
    const tabBlockBottom = narrowTabs ? tabY + 56 : tabY + 28;
    const contentTop = tabBlockBottom + 8;
    const contentBottom = bottom - footerH;
    const rowCount = this.rowButtons.length;
    const availH = Math.max(80, contentBottom - contentTop);
    const rawStep = Math.floor(availH / rowCount);
    const rowStep = Math.max(24, Math.min(44, rawStep));
    const rowFont = rowStep < 34 ? "16px" : "18px";
    const innerW = panel.width - 2 * innerPad;
    const rebindW = Math.min(140, Math.max(88, Math.floor(innerW * 0.22)));
    const rebindH = rowStep < 34 ? 30 : 34;
    const labelMaxW = Math.max(100, innerW - rebindW - 20);

    let y = contentTop + rowStep * 0.5;
    for (const row of this.rowButtons) {
      row.rowText.setPosition(left + innerPad, y);
      row.rowText.setStyle({ fontSize: rowFont, wordWrap: { width: labelMaxW, useAdvancedWrap: true } });
      row.rowBtn.setSize(rebindW, rebindH);
      row.rowBtn.setPosition(right - innerPad - rebindW, y - rebindH / 2);
      y += rowStep;
    }

    const audioDisplayCenterY = (contentTop + contentBottom) * 0.5;
    this.audioSoonText.setPosition(panelCx, audioDisplayCenterY);
    this.audioSoonText.setStyle({ wordWrap: { width: panel.width - 40, useAdvancedWrap: true } });

    const dispX = left + innerPad;
    let dispY = contentTop + 16;
    this.displaySectionLabel.setPosition(dispX, dispY);
    dispY += 32;
    this.fullscreenBtn.setPosition(dispX, dispY);
    dispY += this.fullscreenBtn.height + 18;
    this.hudScaleLabel.setPosition(dispX, dispY + 8);
    dispY += 36;
    const gapBtn = 8;
    let hx = dispX;
    for (const { row } of this._hudScalePickers) {
      if (hx + row.width > right - innerPad) {
        hx = dispX;
        dispY += row.height + 10;
      }
      row.setPosition(hx, dispY);
      hx += row.width + gapBtn;
    }

    this.feedbackText.setPosition(panelCx, bottom - footerH * 0.55);
    this.feedbackText.setStyle({ wordWrap: { width: panel.width - 32, useAdvancedWrap: true } });

    const footY = bottom - innerPad - 28;
    if (panel.width < 420) {
      this.resetBtn.setPosition(panelCx - this.resetBtn.width / 2, footY - 52 - this.resetBtn.height / 2);
      this.backBtn.setPosition(panelCx - this.backBtn.width / 2, footY - this.backBtn.height / 2);
    } else {
      this.backBtn.setPosition(panelCx - 150 - this.backBtn.width / 2, footY - this.backBtn.height / 2);
      this.resetBtn.setPosition(panelCx + 150 - this.resetBtn.width / 2, footY - this.resetBtn.height / 2);
    }
    this._applyTabVisibility();
  }

  _refreshHudScaleTabs() {
    const current = getDisplaySettings().hudScale;
    for (const { scale, row } of this._hudScalePickers) {
      const on = Math.abs(scale - current) < 0.001;
      row.setState(on ? "pressed" : "regular");
    }
  }

  /**
   * @param {"controls"|"audio"|"display"} tab
   */
  setActiveTab(tab) {
    const key = TAB_ORDER.includes(tab) ? tab : "controls";
    this._activeTab = key;
    const activeColor = darkFantasyPalette.textPrimary;
    const idleColor = darkFantasyPalette.textMuted;
    this.tabControls.setStyle({
      color: key === "controls" ? activeColor : idleColor,
      backgroundColor: key === "controls" ? TAB_ACTIVE_BG : TAB_IDLE_BG,
    });
    this.tabAudio.setStyle({
      color: key === "audio" ? activeColor : idleColor,
      backgroundColor: key === "audio" ? TAB_ACTIVE_BG : TAB_IDLE_BG,
    });
    this.tabDisplay.setStyle({
      color: key === "display" ? activeColor : idleColor,
      backgroundColor: key === "display" ? TAB_ACTIVE_BG : TAB_IDLE_BG,
    });
    this._applyTabVisibility();
  }

  _applyTabVisibility() {
    const tab = this._activeTab;
    const controls = tab === "controls";
    const audio = tab === "audio";
    const display = tab === "display";
    for (const row of this.rowButtons) {
      row.rowText.setVisible(controls);
      row.rowBtn.setVisible(controls);
    }
    this.audioSoonText.setVisible(audio);
    this.displaySectionLabel.setVisible(display);
    this.fullscreenBtn.setVisible(display);
    this.hudScaleLabel.setVisible(display);
    for (const { row } of this._hudScalePickers) {
      row.setVisible(display);
    }
    this.resetBtn.setVisible(controls);
    if (display) {
      this._refreshHudScaleTabs();
    }
  }

  refreshRows() {
    const codes = this.keybindStore.getCodes();
    for (const row of this.rowButtons) {
      const keyLabel = formatKeyLabel(codes[row.actionId]);
      const suffix = this._rebindingActionId === row.actionId ? "  [press a key...]" : "";
      row.rowText.setText(`${row.label}: ${keyLabel}${suffix}`);
    }
  }

  beginRebind(actionId) {
    this.setActiveTab("controls");
    this._rebindingActionId = actionId;
    this.setFeedback("Press a key to rebind. Press Esc to cancel.", false);
    this.refreshRows();
    if (this._rebindKeyHandler) {
      this.clearRebindHandler();
    }
    this._rebindKeyHandler = (ev) => {
      if (ev.key === "Escape") {
        this._rebindingActionId = null;
        this.setFeedback("Rebind canceled.", true);
        this.refreshRows();
        this.clearRebindHandler();
        return;
      }
      const keyCode = ev.keyCode;
      const result = this.keybindStore.setBinding(actionId, keyCode);
      if (!result.ok) {
        this.setFeedback(result.reason === "Key already used" ? "That key is already assigned." : result.reason, true);
        return;
      }
      this._rebindingActionId = null;
      this.setFeedback("Keybinding updated.", false);
      this.refreshRows();
      this.clearRebindHandler();
    };
    this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._rebindKeyHandler);
  }

  clearRebindHandler() {
    if (!this._rebindKeyHandler) {
      return;
    }
    this.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._rebindKeyHandler);
    this._rebindKeyHandler = null;
  }

  setFeedback(text, isError) {
    this.feedbackText.setText(text);
    this.feedbackText.setColor(isError ? darkFantasyPalette.textDanger : cozyTheme.colors.textSuccess);
  }

  goBack() {
    const target = this.registry.get("settingsReturnScene") || "main-menu";
    if (target === "game") {
      const gameScene = this.scene.get("game");
      this.scene.stop("settings");
      if (this.scene.isPaused("game")) {
        this.scene.resume("game");
      }
      gameScene?.onReturnFromSettings?.();
      return;
    }
    this.scene.start(target);
  }
}
