export const cozyTheme = {
  colors: {
    bgDark: 0x221a1f,
    panel: 0x2f2630,
    panelBorder: 0xbda67a,
    overlay: 0x120d12,
    button: 0x4f3f38,
    buttonHover: 0x6a5648,
    textPrimary: "#f8efe0",
    textMuted: "#d9c8ac",
    textDanger: "#f28b82",
    textSuccess: "#b7e3a1",
  },
  spacing: {
    cardPadding: 20,
    buttonGap: 14,
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
  const panel = scene.add.rectangle(x, y, width, height, cozyTheme.colors.panel, 0.95);
  panel.setOrigin(0.5, 0.5);
  panel.setStrokeStyle(3, cozyTheme.colors.panelBorder, 1);
  return panel;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} label
 * @param {() => void} onClick
 * @param {{ fontSize?: number, width?: number }} [opts]
 */
export function createCozyButton(scene, label, onClick, opts = {}) {
  const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 24;
  const width = Number.isFinite(opts.width) ? opts.width : 0;
  const button = scene.add.text(0, 0, label, {
    fontFamily: "Georgia, serif",
    fontSize: `${fontSize}px`,
    color: cozyTheme.colors.textPrimary,
    backgroundColor: "#4f3f38",
    padding: { x: 16, y: 10 },
    align: "center",
  });
  button.setOrigin(0.5, 0.5);
  if (width > 0) {
    button.setFixedSize(width, 0);
  }
  button.setInteractive({ useHandCursor: true });
  button.on("pointerdown", () => onClick());
  button.on("pointerover", () => button.setStyle({ backgroundColor: "#6a5648" }));
  button.on("pointerout", () => button.setStyle({ backgroundColor: "#4f3f38" }));
  return button;
}
