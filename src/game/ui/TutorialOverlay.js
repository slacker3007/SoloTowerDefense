import { GAME_EVENT, gameEvents } from "../events.js";
import { getTutorialState, markTutorialCompleted, setTutorialState } from "../settings/tutorialSettings.js";
import { prefersReducedMotion } from "../settings/accessibilitySettings.js";
import { cozyTheme } from "./CozyTheme.js";

const STEPS = [
  "Welcome! Your Home Barracks is selected. Use the first action slot to build a Basic Tower.",
  "Place the tower beside the path. On touch screens: tap a tile, then confirm placement.",
  "The builder will run out and construct it. Protect the barracks while it finishes.",
  "Select the tower and upgrade or convert it when you have enough gold.",
  "Great. Keep layering tower roles to survive boss waves.",
];

export class TutorialOverlay {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.panel = null;
    this.text = null;
    this.nextBtn = null;
    this.skipBtn = null;
    this.step = getTutorialState().step;
    this.completed = getTutorialState().completed;
    this._bound = [];
  }

  create() {
    if (this.completed) {
      return;
    }
    const root = this.scene.add.container(0, 0).setDepth(176);
    const panel = this.scene.add.rectangle(0, 0, 540, 86, cozyTheme.colors.tooltipBg, 0.94)
      .setStrokeStyle(2, cozyTheme.colors.panelBorder, 0.9);
    const text = this.scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: cozyTheme.colors.textPrimary,
      align: "center",
      wordWrap: { width: 480, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);
    const nextBtn = this.scene.add.text(0, 0, "Next", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: cozyTheme.colors.textSuccess,
      backgroundColor: "#2e2a3d",
      padding: { x: 10, y: 5 },
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    const skipBtn = this.scene.add.text(0, 0, "Skip", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "14px",
      color: cozyTheme.colors.textMuted,
      backgroundColor: "#2e2a3d",
      padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    nextBtn.on("pointerdown", () => this.advance());
    skipBtn.on("pointerdown", () => this.complete());
    root.add([panel, text, nextBtn, skipBtn]);
    this.root = root;
    this.panel = panel;
    this.text = text;
    this.nextBtn = nextBtn;
    this.skipBtn = skipBtn;
    this.scene.cameras.main?.ignore?.(root);
    this.layout();
    this.render();
    this.bindEvents();
  }

  bindEvents() {
    const onBuilt = () => this.step < 3 && this.setStep(3);
    const onUpgrade = () => this.step < 4 && this.setStep(4);
    gameEvents.on(GAME_EVENT.TOWER_BUILT, onBuilt);
    gameEvents.on(GAME_EVENT.TOWER_UPGRADED, onUpgrade);
    gameEvents.on(GAME_EVENT.TOWER_CONVERTED, onUpgrade);
    this._bound.push([GAME_EVENT.TOWER_BUILT, onBuilt], [GAME_EVENT.TOWER_UPGRADED, onUpgrade], [GAME_EVENT.TOWER_CONVERTED, onUpgrade]);
  }

  destroy() {
    for (const [event, fn] of this._bound) {
      gameEvents.off(event, fn);
    }
    this._bound = [];
    this.root?.destroy(true);
    this.root = null;
  }

  layout() {
    if (!this.root || !this.panel) {
      return;
    }
    const w = Math.min(560, this.scene.scale.width - 24);
    const h = 92;
    this.root.setPosition(this.scene.scale.width * 0.5, 74);
    this.panel.setSize(w, h);
    this.text?.setPosition(0, -10).setStyle({ wordWrap: { width: w - 56, useAdvancedWrap: true } });
    this.nextBtn?.setPosition(w * 0.5 - 14, h * 0.5 - 18);
    this.skipBtn?.setPosition(-w * 0.5 + 14, h * 0.5 - 18);
  }

  render() {
    if (!this.root || !this.text) {
      return;
    }
    this.text.setText(STEPS[Math.min(this.step, STEPS.length - 1)]);
    this.root.setVisible(!this.completed);
    if (!prefersReducedMotion()) {
      this.scene.tweens.add({ targets: this.root, alpha: { from: 0.4, to: 1 }, duration: 180, ease: "Sine.easeOut" });
    }
  }

  setStep(step) {
    this.step = Math.max(0, Math.min(STEPS.length - 1, Number(step) || 0));
    setTutorialState({ step: this.step });
    this.render();
  }

  advance() {
    if (this.step >= STEPS.length - 1) {
      this.complete();
      return;
    }
    this.setStep(this.step + 1);
  }

  complete() {
    this.completed = true;
    markTutorialCompleted();
    this.root?.setVisible(false);
  }
}
