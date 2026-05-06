import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../game/constants";
import { cozyTheme, createCozyButton, createCozyPanel } from "../game/ui/CozyTheme";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("main-menu");
  }

  create() {
    const { width, height } = this.scale;
    const contentWidth = Math.min(width - 24, 760);
    const centerX = width * 0.5;
    this.add.rectangle(0, 0, width, height, cozyTheme.colors.bgDark, 1).setOrigin(0, 0);
    this.add.rectangle(width * 0.5, height * 0.5, contentWidth, height * 0.9, cozyTheme.colors.overlaySoft, 0.32).setOrigin(0.5, 0.5);

    const panel = createCozyPanel(this, centerX, height * 0.5, Math.min(640, contentWidth - 40), Math.min(560, height * 0.68));
    const title = this.add.text(panel.x, panel.y - panel.height * 0.34, "Solo Tower Defense", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: `${Math.max(40, Math.min(52, Math.round(contentWidth * 0.07)))}px`,
      color: cozyTheme.colors.textOnDark,
      align: "center",
    }).setOrigin(0.5, 0.5);

    const subtitle = this.add.text(panel.x, title.y + 52, "Cozy Frontier", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: `${Math.max(18, Math.min(24, Math.round(contentWidth * 0.035)))}px`,
      color: cozyTheme.colors.textSecondary,
    }).setOrigin(0.5, 0.5);

    const buttonWidth = Math.min(320, contentWidth - 96);
    const firstY = panel.y - 36;
    const gap = 62;
    const startBtn = createCozyButton(this, "Start Run", () => this.scene.start("game"), { width: buttonWidth, fontSize: 26 });
    const settingsBtn = createCozyButton(this, "Settings", () => {
      this.registry.set("settingsReturnScene", "main-menu");
      this.scene.start("settings");
    }, { width: buttonWidth, fontSize: 24 });
    const quitBtn = createCozyButton(this, "Quit", () => {
      window.close();
    }, { width: buttonWidth, fontSize: 24 });

    startBtn.setPosition(panel.x, firstY);
    settingsBtn.setPosition(panel.x, firstY + gap);
    quitBtn.setPosition(panel.x, firstY + gap * 2);

    const hint = this.add.text(panel.x, panel.y + panel.height * 0.34, "Tip: Press 1 to select your Home Barracks in-game.", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: cozyTheme.colors.textMuted,
      align: "center",
      wordWrap: { width: Math.min(520, GAME_WIDTH * 0.5) },
    }).setOrigin(0.5, 0.5);
    hint.setAlpha(0.9);

    this.scale.on(Phaser.Scale.Events.RESIZE, this._handleResize, this);
  }

  _handleResize(size) {
    const w = size.width || GAME_WIDTH;
    const h = size.height || GAME_HEIGHT;
    this.cameras.main.setViewport(0, 0, w, h);
    this.scene.restart();
  }
}
