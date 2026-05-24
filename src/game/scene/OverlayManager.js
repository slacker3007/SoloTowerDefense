import { STARTING_GOLD, STARTING_LIVES } from "../constants";
import { cozyTheme, createCozyButton, createCozyPanel } from "../ui/CozyTheme.js";
import {
  createFantasyMenuRow,
  createFantasyPanel,
  darkFantasyPalette,
} from "../ui/FantasyHudChrome.js";
import { getDisplaySettings } from "../settings/displaySettings.js";
import { prefersReducedMotion } from "../settings/accessibilitySettings.js";
import {
  computeRunScore,
  getBestHighScore,
  saveHighScore,
} from "../settings/highScoreSettings.js";
import { overlayTuning } from "../tuning";

/** Pause / run-complete UI patterns extracted from `GameScene`. */
export class OverlayManager {
  /** @param {Phaser.Scene & Record<string, unknown>} scene */
  constructor(scene) {
    this.scene = scene;
    this.pauseOverlayRoot = null;
    this.pauseBackdrop = null;
    this.pauseGlow = null;
    this.pausePanel = null;
    this.pauseTitle = null;
    this.pauseHint = null;
    this.pauseResumeBtn = null;
    this.pauseSettingsBtn = null;
    this.pauseRestartBtn = null;
    this.pauseMenuBtn = null;
    this.runEndOverlayRoot = null;
    this.runEndBackdrop = null;
    this.runEndPanel = null;
    this.runEndTitle = null;
    this.runEndStats = null;
    this.runEndRetryBtn = null;
    this.runEndMenuBtn = null;

    this.pauseOverlayOpen = false;
    this._runEnded = false;
    /** @type {Phaser.Tweens.Tween[]} */
    this._runEndEntranceTweens = [];
  }

  /** Call from scene `create()` / `restart` so another run can end the game. */
  resetRunState() {
    this._runEnded = false;
    this._killRunEndEntranceTweens();
    this.pauseOverlayOpen = false;
    this.runEndOverlayRoot?.setVisible(false);
  }

  _attachOverlayToUiCamera(root) {
    if (root) this.scene.cameras.main?.ignore?.(root);
  }

  _renderHudReflectingPauseState() {
    const s = /** @type {Record<string, unknown>} */ (this.scene);
    s.hud?.render?.(s.gameState, s.towerSystem?.towers?.length ?? 0, STARTING_LIVES, s.selectedBuilding, typeof s.getWaveInfo === "function" ? s.getWaveInfo() : {});
  }

  togglePause() {
    if (this.scene.editor?.enabled) return;
    this.scene.gameState.paused = !this.scene.gameState.paused;
    this.pauseOverlayOpen = !!this.scene.gameState.paused;
    this.pauseOverlayRoot?.setVisible(this.pauseOverlayOpen);
    this._renderHudReflectingPauseState();
    /** @type {Record<string, unknown>} */ (this.scene)._syncHudCameraTelemetry?.();
  }

  /** @param {string} [reason] @param {Record<string, unknown>} [stats] goldEarned/killStreak/runSeconds waves towersBuilt victory scoreMode — gold defaults to surplus over STARTING_GOLD */
  endRun(reason = "defeat", stats = {}) {
    if (this._runEnded) return;
    this._runEnded = true;

    this.scene.gameState.paused = true;
    this.pauseOverlayOpen = false;
    this.pauseOverlayRoot?.setVisible(false);

    const victory = stats.victory != null ? Boolean(stats.victory) : reason === "victory";
    const waves = Math.max(0, Number(stats.waves != null ? stats.waves : this.scene.gameState.wave) || 0);

    let goldEarned = Math.max(0, Number(stats.goldEarned) || 0);
    if (stats.goldEarned == null || !Number.isFinite(Number(stats.goldEarned))) {
      goldEarned = Math.max(0, (Number(this.scene.gameState.gold) || 0) - STARTING_GOLD);
    }

    const towersBuilt = Math.max(0, Number(stats.towersBuilt ?? this.scene.towerSystem?.towers?.length) || 0);
    const killStreak = Math.max(0, Number(stats.killStreak ?? 0) || 0);
    const runSeconds = Math.max(0, Number(stats.runSeconds ?? 0) || 0);
    const scoreMode =
      typeof stats.scoreMode === "string" && stats.scoreMode.length > 0 ? stats.scoreMode : "campaign";
    const title = victory ? "Victory" : "Defeat";
    this.runEndTitle?.setText(title);

    const computedScore = computeRunScore({
      waves,
      goldEarned,
      towersBuilt,
      killStreak,
      runSeconds,
      victory,
    });

    saveHighScore(scoreMode, {
      score: computedScore,
      waves,
      goldEarned,
      towersBuilt,
      killStreak,
      runSeconds,
    });
    const best = getBestHighScore(scoreMode);
    const bestLine =
      best && Number.isFinite(Number(best.score)) ? `\nBest high score: ${Number(best.score)}` : "\nBest high score: —";

    const timeLabel = OverlayManager.formatRunTime(runSeconds);
    const lines = [
      `Waves survived: ${waves}`,
      `Gold earned: ${goldEarned}`,
      `Towers built: ${towersBuilt}`,
      `Kill streak (best): ${killStreak}`,
      `Run time: ${timeLabel}`,
      "",
      `Score: ${computedScore}`,
      `${bestLine.trim()}`,
      "",
      `Gold remaining: ${Math.max(0, Number(this.scene.gameState.gold) || 0)}`,
    ];

    this.runEndStats?.setText(lines.join("\n"));
    this.runEndOverlayRoot?.setVisible(true);
    this.layoutRunEndOverlay();
    this.showRunEndAnimated();
  }

  showRunEndAnimated() {
    this._killRunEndEntranceTweens();
    const roots = /** @type {Phaser.GameObjects.GameObject[]} */ ([
      this.runEndPanel,
      this.runEndTitle,
      this.runEndStats,
      this.runEndRetryBtn,
      this.runEndMenuBtn,
    ].filter(Boolean));

    if (!this.runEndOverlayRoot?.visible || prefersReducedMotion()) {
      roots.forEach((obj) => {
        obj?.setAlpha?.(1);
        obj?.setScale?.(1);
      });
      return;
    }

    this.scene.tweens.killTweensOf?.(roots);
    /** @type {Phaser.Tweens.Tween[]} */
    const spawned = [];

    roots.forEach((obj) => {
      const oy = typeof obj?.y === "number" ? obj.y : 0;
      obj.setAlpha(0);
      obj.setY(oy + 14);
      obj.setScale(0.965);
      spawned.push(
        this.scene.tweens.add({
          targets: obj,
          alpha: 1,
          y: oy,
          scaleX: 1,
          scaleY: 1,
          duration: 340,
          ease: "Sine.easeOut",
        }),
      );
    });
    this._runEndEntranceTweens = spawned;
  }

  _killRunEndEntranceTweens() {
    const roots = [this.runEndPanel, this.runEndTitle, this.runEndStats, this.runEndRetryBtn, this.runEndMenuBtn].filter(
      Boolean,
    );
    if (roots.length && this.scene?.tweens?.killTweensOf) {
      this.scene.tweens.killTweensOf(roots);
    }
    this._runEndEntranceTweens.forEach((tw) => {
      tw?.stop?.();
      tw?.remove?.();
    });
    this._runEndEntranceTweens = [];
  }

  /** @param {number} secs */
  static formatRunTime(secs) {
    const total = Math.max(0, Math.floor(Number(secs) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
  }

  createPauseOverlay() {
    const sceneHooks = /** @type {Record<string, unknown>} */ (this.scene);
    this.pauseOverlayRoot?.destroy(true);

    const backdrop = this.scene.add.rectangle(0, 0, 100, 100, darkFantasyPalette.trayShadow, 1).setOrigin(0, 0);
    backdrop.setInteractive();
    backdrop.on("pointerdown", () => this.togglePause());

    const glow = this.scene.add.rectangle(0, 0, 100, 100, darkFantasyPalette.trayBase, 0.22).setOrigin(0.5, 0.5);
    const panel = createFantasyPanel(this.scene);
    const title = this.scene.add.text(0, 0, "Paused", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "48px",
      color: darkFantasyPalette.textPrimary,
    }).setOrigin(0.5, 0.5);
    const hint = this.scene.add.text(0, 0, "Press P or Esc to resume", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "16px",
      color: darkFantasyPalette.textMuted,
    }).setOrigin(0.5, 0.5);

    const resumeBtn = createFantasyMenuRow(this.scene, {
      label: "Resume",
      onClick: () => this.togglePause(),
    });
    const settingsBtn = createFantasyMenuRow(this.scene, {
      label: "Settings",
      onClick: () =>
        typeof sceneHooks.openSettingsFromGame === "function" ? sceneHooks.openSettingsFromGame() : undefined,
    });
    const restartBtn = createFantasyMenuRow(this.scene, {
      label: "Restart",
      onClick: () => this.scene.scene.restart(),
    });
    const menuBtn = createFantasyMenuRow(this.scene, {
      label: "Main menu",
      onClick: () =>
        typeof sceneHooks.backToMainMenu === "function" ? sceneHooks.backToMainMenu() : undefined,
    });

    this.pauseBackdrop = backdrop;
    this.pauseGlow = glow;
    this.pausePanel = panel;
    this.pauseTitle = title;
    this.pauseHint = hint;
    this.pauseResumeBtn = resumeBtn;
    this.pauseSettingsBtn = settingsBtn;
    this.pauseRestartBtn = restartBtn;
    this.pauseMenuBtn = menuBtn;

    this.pauseOverlayRoot = this.scene.add.container(0, 0, [
      backdrop,
      glow,
      panel.container,
      title,
      hint,
      resumeBtn.container,
      settingsBtn.container,
      restartBtn.container,
      menuBtn.container,
    ]);
    this.pauseOverlayRoot.setDepth(overlayTuning.pauseDepth);
    this.pauseOverlayRoot.setVisible(false);
    this._attachOverlayToUiCamera(this.pauseOverlayRoot);
    this.layoutPauseOverlay();
  }

  createRunEndOverlay() {
    this.runEndOverlayRoot?.destroy(true);
    this.runEndBackdrop = this.scene.add
      .rectangle(0, 0, 100, 100, cozyTheme.colors.overlay, 0.72)
      .setOrigin(0, 0);
    this.runEndPanel = createCozyPanel(this.scene, 0, 0, 680, 520);
    this.runEndTitle = this.scene.add.text(0, 0, "Run Complete", {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: "46px",
      color: cozyTheme.colors.textPrimary,
    }).setOrigin(0.5, 0.5);
    this.runEndStats = this.scene.add.text(0, 0, "", {
      fontFamily: cozyTheme.typography.bodyFamily,
      fontSize: "18px",
      color: cozyTheme.colors.textMuted,
      align: "center",
    }).setOrigin(0.5, 0.5);
    const sceneHooks = /** @type {Record<string, unknown>} */ (this.scene);
    this.runEndRetryBtn = createCozyButton(this.scene, "Retry", () => this.scene.scene.restart(), {
      width: 220,
      fontSize: 24,
    });
    this.runEndMenuBtn = createCozyButton(
      this.scene,
      "Back to Menu",
      () => (typeof sceneHooks.backToMainMenu === "function" ? sceneHooks.backToMainMenu() : undefined),
      { width: 220, fontSize: 24 },
    );
    this.runEndOverlayRoot = this.scene.add.container(0, 0, [
      this.runEndBackdrop,
      this.runEndPanel,
      this.runEndTitle,
      this.runEndStats,
      this.runEndRetryBtn,
      this.runEndMenuBtn,
    ]);
    this.runEndOverlayRoot.setDepth(overlayTuning.runEndDepth);
    this.runEndOverlayRoot.setVisible(false);
    this._attachOverlayToUiCamera(this.runEndOverlayRoot);
    this.layoutRunEndOverlay();
  }

  layoutPauseOverlay() {
    if (!this.pauseOverlayRoot || !this.pauseBackdrop) return;
    const width = Math.max(1, this.scene.scale.width);
    const height = Math.max(1, this.scene.scale.height);
    const hudScale = getDisplaySettings().hudScale;
    const overlayScale = Number.isFinite(hudScale) && hudScale > 0 ? hudScale : 1;
    this.pauseOverlayRoot.setScale(overlayScale);
    this.pauseBackdrop.setSize(width / overlayScale, height / overlayScale);
    const cx = width / (2 * overlayScale);
    const cy = height / (2 * overlayScale);
    const panelW = Math.min(400, Math.round((width * 0.72) / overlayScale));
    const menuInset = 14;
    const rowCount = 4;
    const minRowGap = 6;
    const defaultRowH = 36;
    const headerToButtons = 92;
    const minPanelH = headerToButtons + defaultRowH * rowCount + minRowGap * (rowCount - 1) + menuInset;
    const maxPanelH = Math.round((height * 0.9) / overlayScale);
    let panelH = Math.min(380, Math.max(minPanelH, Math.round((height * 0.42) / overlayScale)));
    panelH = Math.min(panelH, maxPanelH);
    const panelLeft = cx - panelW / 2;
    const panelTop = cy - panelH / 2;

    this.pauseGlow?.setPosition(cx, cy).setSize(panelW, panelH);
    this.pausePanel?.setSize(panelW, panelH);
    this.pausePanel?.setPosition(panelLeft, panelTop);

    const titleSize = Math.max(32, Math.min(48, Math.round(panelW * 0.1)));
    const titleY = panelTop + 40;
    this.pauseTitle?.setPosition(cx, titleY).setStyle({ fontSize: `${titleSize}px` });

    const hintY = panelTop + 68;
    this.pauseHint?.setPosition(cx, hintY);

    const menuRowW = panelW - menuInset * 2;
    const contentTop = panelTop + headerToButtons;
    const contentBottom = panelTop + panelH - menuInset;
    const availH = Math.max(defaultRowH, contentBottom - contentTop);
    let menuRowH = defaultRowH;
    let itemGap = minRowGap;
    let neededH = menuRowH * rowCount + itemGap * (rowCount - 1);
    if (neededH > availH) {
      itemGap = Math.max(4, Math.floor((availH - menuRowH * rowCount) / (rowCount - 1)));
      if (menuRowH * rowCount + itemGap * (rowCount - 1) > availH) {
        menuRowH = Math.max(28, Math.floor((availH - itemGap * (rowCount - 1)) / rowCount));
      }
      neededH = menuRowH * rowCount + itemGap * (rowCount - 1);
    } else {
      itemGap = Math.max(minRowGap, Math.round((availH - menuRowH * rowCount) / (rowCount - 1)));
    }
    const blockH = neededH;
    const blockTop = contentTop + Math.max(0, Math.floor((availH - blockH) / 2));
    const rows = [this.pauseResumeBtn, this.pauseSettingsBtn, this.pauseRestartBtn, this.pauseMenuBtn];
    rows.forEach((row, i) => {
      if (row) {
        row.setSize(menuRowW, menuRowH);
        row.setPosition(panelLeft + menuInset, blockTop + (menuRowH + itemGap) * i);
      }
    });
  }

  layoutRunEndOverlay() {
    if (!this.runEndOverlayRoot || !this.runEndBackdrop) return;
    const width = Math.max(1, this.scene.scale.width);
    const height = Math.max(1, this.scene.scale.height);
    const hudScale = getDisplaySettings().hudScale;
    const overlayScale = Number.isFinite(hudScale) && hudScale > 0 ? hudScale : 1;
    this.runEndOverlayRoot.setScale(overlayScale);
    this.runEndBackdrop.setSize(width / overlayScale, height / overlayScale);
    const cx = width / (2 * overlayScale);
    const cy = height / (2 * overlayScale);
    const panelW = Math.min(680, Math.round((width * 0.9) / overlayScale));
    const panelH = Math.min(560, Math.round((height * 0.74) / overlayScale));
    this.runEndPanel.setPosition(cx, cy);
    this.runEndPanel.setSize(panelW, panelH);

    const titlePad = panelH * 0.06;
    this.runEndTitle.setPosition(cx, cy - panelH * 0.5 + Math.max(titlePad, 40));
    this.runEndStats.setPosition(cx, cy - 8).setWordWrapWidth(Math.max(180, panelW - 72), true);

    const btnY = cy + panelH * 0.5 - 76;
    const btnSpread = Math.min(138, panelW * 0.22);
    this.runEndRetryBtn.setPosition(cx - btnSpread, btnY);
    this.runEndMenuBtn.setPosition(cx + btnSpread, btnY);
  }

  destroy() {
    this._killRunEndEntranceTweens();
    this.pauseOverlayRoot?.destroy(true);
    this.runEndOverlayRoot?.destroy(true);
  }
}
