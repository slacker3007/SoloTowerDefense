import Phaser from "phaser";
import { KEYBIND_ACTION_IDS, KEYBIND_DESCRIPTIONS, KeybindStore, formatKeyLabel } from "../game/input/KeybindStore.js";
import { cozyTheme, createCozyButton, createCozyPanel } from "../game/ui/CozyTheme";

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super("settings");
    this._rebindingActionId = null;
  }

  create() {
    this.keybindStore = new KeybindStore();
    const { width, height } = this.scale;
    const contentWidth = Math.min(width - 24, 800);
    const centerX = width * 0.5;
    this.add.rectangle(0, 0, width, height, cozyTheme.colors.bgDark, 1).setOrigin(0, 0);
    this.add.rectangle(width * 0.5, height * 0.5, contentWidth, height * 0.9, cozyTheme.colors.overlaySoft, 0.28).setOrigin(0.5, 0.5);
    const panel = createCozyPanel(this, centerX, height * 0.5, Math.min(780, contentWidth - 16), Math.min(980, height * 0.92));

    this.add.text(panel.x, panel.y - panel.height * 0.43, "Settings", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: `${Math.max(34, Math.min(52, Math.round(contentWidth * 0.065)))}px`,
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);

    this.tabControls = this.add.text(panel.x - panel.width * 0.43, panel.y - panel.height * 0.35, "Controls", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "30px",
      color: cozyTheme.colors.textOnDark,
      backgroundColor: "#6a5648",
      padding: { x: cozyTheme.spacing.md, y: cozyTheme.spacing.sm },
    }).setOrigin(0, 0.5);
    this.tabAudio = this.add.text(this.tabControls.x + 200, this.tabControls.y, "Audio (Soon)", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "26px",
      color: cozyTheme.colors.textMuted,
    }).setOrigin(0, 0.5);
    this.tabDisplay = this.add.text(this.tabAudio.x + 220, this.tabControls.y, "Display (Soon)", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "26px",
      color: cozyTheme.colors.textMuted,
    }).setOrigin(0, 0.5);

    this.feedbackText = this.add.text(panel.x, panel.y + panel.height * 0.33, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "24px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    }).setOrigin(0.5, 0.5);

    this.rowButtons = [];
    const startY = panel.y - panel.height * 0.25;
    const stepY = 48;
    KEYBIND_ACTION_IDS.forEach((actionId, index) => {
      const label = KEYBIND_DESCRIPTIONS[actionId] ?? actionId;
      const rowText = this.add.text(panel.x - panel.width * 0.42, startY + index * stepY, "", {
        fontFamily: cozyTheme.typography.bodyFamily,
        fontSize: "24px",
        color: cozyTheme.colors.textSecondary,
      }).setOrigin(0, 0.5);
      const rowBtn = createCozyButton(this, "Rebind", () => this.beginRebind(actionId), { fontSize: 22, width: 160, variant: "muted" });
      rowBtn.setPosition(panel.x + panel.width * 0.33, startY + index * stepY);
      this.rowButtons.push({ actionId, label, rowText, rowBtn });
    });

    const backBtn = createCozyButton(this, "Back", () => this.goBack(), { fontSize: 28, width: 220 });
    const resetBtn = createCozyButton(this, "Reset Defaults", () => {
      this.keybindStore.resetToDefaults();
      this.setFeedback("Controls reset to defaults.", false);
      this.refreshRows();
    }, { fontSize: 26, width: 300 });
    backBtn.setPosition(panel.x - 130, panel.y + panel.height * 0.42);
    resetBtn.setPosition(panel.x + 150, panel.y + panel.height * 0.42);

    this._globalKeydown = (ev) => {
      if (ev.key === "Escape" && !this._rebindingActionId) {
        this.goBack();
      }
    };
    this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._globalKeydown);
    this.refreshRows();
  }

  shutdown() {
    if (this._globalKeydown) {
      this.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this._globalKeydown);
    }
    this.clearRebindHandler();
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
    this.feedbackText.setColor(isError ? cozyTheme.colors.textDanger : cozyTheme.colors.textSuccess);
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
