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
 * @param {{ fontSize?: number, width?: number, variant?: "primary" | "muted" }} [opts]
 */
export function createCozyButton(scene, label, onClick, opts = {}) {
  const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 24;
  const width = Number.isFinite(opts.width) ? opts.width : 0;
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
    button.setStyle({ backgroundColor: activeBg });
    onClick();
  });
  button.on("pointerup", () => button.setStyle({ backgroundColor: hoverBg }));
  button.on("pointerover", () => button.setStyle({ backgroundColor: hoverBg }));
  button.on("pointerout", () => button.setStyle({ backgroundColor: baseBg }));
  return button;
}
