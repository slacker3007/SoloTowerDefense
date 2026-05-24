import { audioManager } from "../systems/AudioManager.js";

export const cozyTheme = {
  colors: {
    bgDark: 0x221a1f,
    bgGradientTop: 0x2a2027,
    panel: 0x2f2630,
    panelElevated: 0x3a2f3c,
    panelBorder: 0xbda67a,
    panelBorderSoft: 0x9f8a66,
    overlay: 0x120d12,
    overlaySoft: 0x1a1319,
    button: 0x4f3f38,
    buttonHover: 0x6a5648,
    buttonActive: 0x8a6f58,
    buttonMuted: 0x453a42,
    buttonMutedHover: 0x5e4e5d,
    textPrimary: "#f8efe0",
    textSecondary: "#ead9be",
    textMuted: "#d9c8ac",
    textWarning: "#ffd08a",
    textDanger: "#f28b82",
    textSuccess: "#b7e3a1",
    textOnDark: "#ffffff",
    surface: 0x312936,
    surfaceRaised: 0x3b3140,
    accent: 0x7aa2d1,
    success: 0x4aa37a,
    danger: 0xb35a5a,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    cardPadding: 16,
    buttonGap: 8,
    buttonPadX: 16,
    buttonPadY: 8,
  },
  typography: {
    titleFamily: "Georgia, serif",
    bodyFamily: "monospace",
    titleWeight: "normal",
    scale: {
      sm: 12,
      md: 14,
      lg: 18,
      xl: 24,
    },
  },
  hud: {
    topBar: 0x2a2229,
    bottomBar: 0x271f26,
    panel: 0x2f2630,
    panelElevated: 0x382d39,
    panelStroke: 0xbda67a,
    panelStrokeSoft: 0x8f7b5f,
    chipBg: 0x3d3142,
    chipStroke: 0xb39a74,
    chipText: "#f7ead6",
    tooltipBg: 0x1a141b,
    tooltipStroke: 0xbda67a,
    actionFrame: 0x5d4b63,
    landscapeContextScale: 0.9,
    landscapeSidePanelMinWidth: 280,
    landscapeSidePanelMaxWidth: 380,
    windowHeader: 0x352c38,
    windowHandle: 0x6b8fb5,
    windowHandleActive: 0x8fb7e3,
    lockLocked: "#ffe3a3",
    lockUnlocked: "#b7f7da",
  },
  hudButton: {
    primary: "#4f3f38",
    primaryHover: "#6a5648",
    primaryActive: "#8a6f58",
    muted: "#453a42",
    mutedHover: "#5e4e5d",
    mutedActive: "#6d5b6b",
    disabled: "#453a42",
  },
  darkFantasy: {
    sideButtonW: 36,
    sideButtonH: 36,
    sideButtonGap: 4,
    sideButtonFontSize: 16,
    slotSize: 48,
    slotGap: 6,
    barHeight: 14,
    resourceBarWidth: 110,
    barLabelFontSize: 11,
    keybindFontSize: 10,
    trayPad: 6,
    railGap: 6,
    railInnerPad: 6,
    barsToSlotsGap: 4,
    dividerW: 3,
    pageSelectorW: 22,
    pageSelectorH: 48,
    barsGap: 8,
    minTrayHeight: 0,
  },
};

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export function createCozyPanel(scene, x, y, width, height) {
  const panel = scene.add.rectangle(x, y, width, height, cozyTheme.colors.panelElevated, 0.96);
  panel.setOrigin(0.5, 0.5);
  panel.setStrokeStyle(3, cozyTheme.colors.panelBorder, 1);
  return panel;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} label
 * @param {() => void} onClick
 * @param {{ fontSize?: number, width?: number, variant?: "primary" | "muted", texture?: { base: string, pressed: string, hover?: string } }} [opts]
 */
export function createCozyButton(scene, label, onClick, opts = {}) {
  const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 24;
  const width = Number.isFinite(opts.width) ? opts.width : 0;
  const tex = opts.texture;
  if (tex?.base && tex?.pressed && scene.textures.exists(tex.base) && scene.textures.exists(tex.pressed)) {
    const buttonH = 64;
    const buttonW = Math.max(buttonH * 2, width || 320);
    const capW = buttonH;
    const midW = Math.max(buttonH, buttonW - capW * 2);
    const hitZone = scene.add
      .rectangle(0, 0, buttonW, buttonH, 0x000000, 0.001)
      .setOrigin(0.5, 0.5);
    const left = scene.add.sprite(-buttonW * 0.5 + capW * 0.5, 0, tex.base, 0);
    const middle = scene.add.tileSprite(0, 0, midW, buttonH, tex.base, 2);
    const right = scene.add.sprite(buttonW * 0.5 - capW * 0.5, 0, tex.base, 4);
    const txt = scene.add.text(0, 0, label, {
      fontFamily: cozyTheme.typography.titleFamily,
      fontSize: `${fontSize}px`,
      color: cozyTheme.colors.textPrimary,
      align: "center",
    });
    txt.setOrigin(0.5, 0.5);
    txt.setY(-2);
    const container = scene.add.container(0, 0, [hitZone, left, middle, right, txt]);
    container.setSize(buttonW, buttonH);
    hitZone.setInteractive({ useHandCursor: true });
    const setTex = (key) => {
      if (scene.textures.exists(key)) {
        left.setTexture(key, 0);
        middle.setTexture(key, 2);
        right.setTexture(key, 4);
      }
    };
    hitZone.on("pointerdown", () => {
      audioManager.playSfx("ui-click");
      setTex(tex.pressed);
      onClick();
    });
    hitZone.on("pointerup", () => setTex(tex.hover ?? tex.base));
    hitZone.on("pointerover", () => {
      audioManager.playSfx("ui-hover");
      setTex(tex.hover ?? tex.base);
    });
    hitZone.on("pointerout", () => setTex(tex.base));
    return container;
  }
  const variant = opts.variant === "muted" ? "muted" : "primary";
  const baseBg = variant === "muted" ? "#453a42" : "#4f3f38";
  const hoverBg = variant === "muted" ? "#5e4e5d" : "#6a5648";
  const activeBg = variant === "muted" ? "#6d5b6b" : "#8a6f58";
  const button = scene.add.text(0, 0, label, {
    fontFamily: cozyTheme.typography.titleFamily,
    fontSize: `${fontSize}px`,
    color: cozyTheme.colors.textPrimary,
    backgroundColor: baseBg,
    padding: { x: cozyTheme.spacing.buttonPadX, y: cozyTheme.spacing.buttonPadY },
    align: "center",
  });
  button.setOrigin(0.5, 0.5);
  if (width > 0) {
    button.setFixedSize(width, 0);
  }
  button.setInteractive({ useHandCursor: true });
  button.on("pointerdown", () => {
    audioManager.playSfx("ui-click");
    button.setStyle({ backgroundColor: activeBg });
    onClick();
  });
  button.on("pointerup", () => button.setStyle({ backgroundColor: hoverBg }));
  button.on("pointerover", () => {
    audioManager.playSfx("ui-hover");
    button.setStyle({ backgroundColor: hoverBg });
  });
  button.on("pointerout", () => button.setStyle({ backgroundColor: baseBg }));
  return button;
}

/**
 * Compact in-game HUD button (left-aligned origin, cozy palette).
 * @param {Phaser.Scene} scene
 * @param {string} label
 * @param {() => void} [onClick]
 * @param {{ fontSize?: number, interactive?: boolean, variant?: "primary" | "muted", compact?: boolean, useHoverBackground?: boolean }} [opts]
 */
export function createHudButton(scene, label, onClick = null, opts = {}) {
  const interactive = opts.interactive !== false;
  const variant = opts.variant === "muted" ? "muted" : "primary";
  const compact = opts.compact === true;
  const useHover = opts.useHoverBackground !== false;
  const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : cozyTheme.typography.scale.md;
  const baseBg = interactive
    ? variant === "muted"
      ? cozyTheme.hudButton.muted
      : cozyTheme.hudButton.primary
    : cozyTheme.hudButton.disabled;
  const hoverBg = variant === "muted" ? cozyTheme.hudButton.mutedHover : cozyTheme.hudButton.primaryHover;
  const activeBg = variant === "muted" ? cozyTheme.hudButton.mutedActive : cozyTheme.hudButton.primaryActive;
  const padX = compact ? cozyTheme.spacing.sm : 10;
  const padY = compact ? cozyTheme.spacing.xs + 2 : 6;
  const button = scene.add.text(0, 0, label, {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${fontSize}px`,
    color: cozyTheme.colors.textPrimary,
    backgroundColor: baseBg,
    padding: { x: padX, y: padY },
  });
  button.setOrigin(0, 0.5);
  if (interactive) {
    button.setInteractive({ useHandCursor: true });
    if (typeof onClick === "function") {
      button.on("pointerdown", () => {
        audioManager.playSfx("ui-click");
        if (useHover) {
          button.setStyle({ backgroundColor: activeBg });
        }
        onClick();
      });
      if (useHover) {
        button.on("pointerup", () => button.setStyle({ backgroundColor: hoverBg }));
        button.on("pointerover", () => {
          audioManager.playSfx("ui-hover");
          button.setStyle({ backgroundColor: hoverBg });
        });
        button.on("pointerout", () => button.setStyle({ backgroundColor: baseBg }));
      }
    }
  }
  return button;
}
