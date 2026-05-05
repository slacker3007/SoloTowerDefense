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
    this.add.rectangle(0, 0, width, height, cozyTheme.colors.bgDark, 1).setOrigin(0, 0);
    const panel = createCozyPanel(this, width * 0.5, height * 0.5, Math.min(1120, width * 0.9), Math.min(820, height * 0.9));

    this.add.text(panel.x, panel.y - panel.height * 0.43, "Settings", {
      fontFamily: "Georgia, serif",
      fontSize: "60px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);

    this.tabControls = this.add.text(panel.x - 360, panel.y - panel.height * 0.33, "Controls", {
      fontFamily: "Georgia, serif",
      fontSize: "30px",
      color: cozyTheme.colors.textPrimary,
      backgroundColor: "#6a5648",
      padding: { x: 14, y: 10 },
    }).setOrigin(0, 0.5);
    this.tabAudio = this.add.text(this.tabControls.x + 240, this.tabControls.y, "Audio (Soon)", {
      fontFamily: "Georgia, serif",
      fontSize: "26px",
      color: cozyTheme.colors.textMuted,
    }).setOrigin(0, 0.5);
    this.tabDisplay = this.add.text(this.tabAudio.x + 260, this.tabControls.y, "Display (Soon)", {
      fontFamily: "Georgia, serif",
      fontSize: "26px",
      color: cozyTheme.colors.textMuted,
    }).setOrigin(0, 0.5);

    this.feedbackText = this.add.text(panel.x, panel.y + panel.height * 0.33, "", {
      fontFamily: "monospace",
      fontSize: "24px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    }).setOrigin(0.5, 0.5);

    this.rowButtons = [];
    const startY = panel.y - panel.height * 0.21;
    const stepY = 44;
    KEYBIND_ACTION_IDS.forEach((actionId, index) => {
      const label = KEYBIND_DESCRIPTIONS[actionId] ?? actionId;
      const rowText = this.add.text(panel.x - 390, startY + index * stepY, "", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: cozyTheme.colors.textPrimary,
      }).setOrigin(0, 0.5);
      const rowBtn = createCozyButton(this, "Rebind", () => this.beginRebind(actionId), { fontSize: 24, width: 170 });
      rowBtn.setPosition(panel.x + 360, startY + index * stepY);
      this.rowButtons.push({ actionId, label, rowText, rowBtn });
    });

    const backBtn = createCozyButton(this, "Back", () => this.goBack(), { fontSize: 28, width: 220 });
    const resetBtn = createCozyButton(this, "Reset Defaults", () => {
      this.keybindStore.resetToDefaults();
      this.setFeedback("Controls reset to defaults.", false);
      this.refreshRows();
    }, { fontSize: 26, width: 300 });
    backBtn.setPosition(panel.x - 190, panel.y + panel.height * 0.55);
    resetBtn.setPosition(panel.x + 160, panel.y + panel.height * 0.55);

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
