import { cozyTheme } from "./CozyTheme.js";

/** @typedef {"regular" | "hover" | "pressed" | "disabled"} FantasyButtonState */

export const darkFantasyPalette = {
  trayBase: 0x1a1524,
  trayHighlight: 0x3d3550,
  trayShadow: 0x0d0a14,
  trayInner: 0x121018,
  buttonBase: 0x2e2a3d,
  buttonHover: 0x3d3550,
  buttonPressed: 0x1f1b2a,
  buttonDisabled: 0x1a1722,
  buttonStroke: 0x4a3f5c,
  buttonStrokeHi: 0x6b5f82,
  slotBase: 0x14121c,
  slotInset: 0x0a0810,
  slotBorder: 0x5a5a66,
  slotBorderHi: 0x7a7a8a,
  slotGlow: 0x6f99c9,
  barTrack: 0x121018,
  barTrackStroke: 0x2a2438,
  hpFill: 0x9b2030,
  hpFillHi: 0xc43040,
  goldFill: 0xc9a227,
  goldFillHi: 0xe8c04a,
  divider: 0x3d3550,
  textPrimary: "#f0ece8",
  textMuted: "#9a92a8",
  textDanger: "#f28b82",
  costBadgeBg: "#1a1218cc",
  infoBadgeBg: "#1a1524dd",
};

const df = cozyTheme.darkFantasy;

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} w
 * @param {number} h
 * @param {{ fill?: number, inset?: number }} [opts]
 */
export function drawStonePanel(g, w, h, opts = {}) {
  const fill = opts.fill ?? darkFantasyPalette.trayBase;
  const inset = opts.inset ?? 2;
  g.clear();
  g.fillStyle(fill, 1);
  g.fillRect(0, 0, w, h);
  g.lineStyle(1, darkFantasyPalette.trayHighlight, 1);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.lineStyle(1, darkFantasyPalette.trayShadow, 1);
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  if (inset > 0) {
    g.lineStyle(1, darkFantasyPalette.trayInner, 0.6);
    g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} cx
 * @param {number} cy
 * @param {number} [size]
 */
export function drawHamburgerIcon(g, cx, cy, size = 14) {
  const lineW = size;
  const lineH = 2;
  const gap = 4;
  g.fillStyle(0xf0ece8, 1);
  for (let i = -1; i <= 1; i += 1) {
    const y = cy + i * gap - lineH / 2;
    g.fillRect(cx - lineW / 2, y, lineW, lineH);
  }
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} size
 */
export function drawFantasyChip(g, size) {
  const inset = 2;
  const inner = size - inset * 2;
  g.clear();
  g.fillStyle(darkFantasyPalette.slotInset, 1);
  g.fillRect(0, 0, size, size);
  g.fillStyle(darkFantasyPalette.slotBase, 1);
  g.fillRect(inset, inset, inner, inner);
  g.lineStyle(1, darkFantasyPalette.trayShadow, 0.9);
  g.strokeRect(inset + 0.5, inset + 0.5, inner - 1, inner - 1);
  g.lineStyle(1, darkFantasyPalette.slotBorder, 1);
  g.strokeRect(inset, inset, inner, inner);
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} w
 * @param {number} h
 */
export function drawFantasyBarTrack(g, w, h) {
  g.clear();
  g.fillStyle(darkFantasyPalette.barTrack, 1);
  g.fillRect(0, 0, w, h);
  g.lineStyle(1, darkFantasyPalette.barTrackStroke, 1);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.lineStyle(1, darkFantasyPalette.trayShadow, 0.7);
  g.beginPath();
  g.moveTo(1, h - 1);
  g.lineTo(w - 1, h - 1);
  g.lineTo(w - 1, 1);
  g.strokePath();
}

/**
 * @param {Phaser.Scene} scene
 */
export function createFantasyPanel(scene) {
  const container = scene.add.container(0, 0);
  const graphics = scene.add.graphics();
  container.add(graphics);
  let width = 0;
  let height = 0;

  const panel = {
    container,
    graphics,
    get x() {
      return container.x;
    },
    get y() {
      return container.y;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    setPosition(x, y) {
      container.setPosition(x, y);
    },
    setSize(w, h) {
      width = Math.max(0, Math.round(w));
      height = Math.max(0, Math.round(h));
      drawStonePanel(graphics, width, height);
    },
    setVisible(visible) {
      container.setVisible(visible);
    },
  };

  return panel;
}

/**
 * @param {Phaser.Scene} scene
 */
export function createFantasyChipHost(scene) {
  const container = scene.add.container(0, 0);
  const graphics = scene.add.graphics();
  container.add(graphics);
  let size = 38;

  const chip = {
    container,
    graphics,
    get x() {
      return container.x;
    },
    get y() {
      return container.y;
    },
    get width() {
      return size;
    },
    get height() {
      return size;
    },
    setPosition(x, y) {
      container.setPosition(x, y);
    },
    setSize(w, h) {
      size = Math.max(8, Math.round(Math.max(w, h)));
      drawFantasyChip(graphics, size);
    },
    setVisible(visible) {
      container.setVisible(visible);
    },
  };

  chip.setSize(38, 38);
  return chip;
}

/**
 * @param {Phaser.Scene} scene
 */
export function createFantasyBarTrackHost(scene) {
  const container = scene.add.container(0, 0);
  const graphics = scene.add.graphics();
  container.add(graphics);
  let width = 120;
  let height = 12;

  const track = {
    container,
    graphics,
    get x() {
      return container.x;
    },
    get y() {
      return container.y;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    setPosition(x, y) {
      container.setPosition(x, y);
    },
    setSize(w, h) {
      width = Math.max(4, Math.round(w));
      height = Math.max(4, Math.round(h));
      drawFantasyBarTrack(graphics, width, height);
    },
    setVisible(visible) {
      container.setVisible(visible);
    },
  };

  track.setSize(120, 12);
  return track;
}

/**
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} w
 * @param {number} h
 * @param {FantasyButtonState} state
 */
function drawBeveledButton(g, w, h, state) {
  g.clear();
  let fill = darkFantasyPalette.buttonBase;
  let stroke = darkFantasyPalette.buttonStroke;
  if (state === "hover") {
    fill = darkFantasyPalette.buttonHover;
    stroke = darkFantasyPalette.buttonStrokeHi;
  } else if (state === "pressed") {
    fill = darkFantasyPalette.buttonPressed;
    stroke = darkFantasyPalette.buttonStroke;
  } else if (state === "disabled") {
    fill = darkFantasyPalette.buttonDisabled;
    stroke = darkFantasyPalette.buttonStroke;
  }
  g.fillStyle(fill, 1);
  g.fillRect(0, 0, w, h);
  if (state !== "pressed") {
    g.lineStyle(1, darkFantasyPalette.trayHighlight, state === "disabled" ? 0.35 : 0.85);
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 0);
    g.lineTo(w, 0);
    g.strokePath();
  }
  g.lineStyle(1, darkFantasyPalette.trayShadow, state === "disabled" ? 0.35 : 0.85);
  g.beginPath();
  g.moveTo(w, 0);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.strokePath();
  g.lineStyle(1, stroke, state === "disabled" ? 0.5 : 1);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ width?: number, height?: number, label?: string, icon?: "hamburger", interactive?: boolean, onClick?: () => void, keybindLabel?: string, keybindCorner?: "top" | "bottom" }} [opts]
 */
export function createFantasyButton(scene, opts = {}) {
  const w = opts.width ?? df.sideButtonW;
  const h = opts.height ?? df.sideButtonH;
  const interactive = opts.interactive !== false;
  const isHamburger = opts.icon === "hamburger";
  const label = isHamburger ? "" : (opts.label ?? "");
  const keybindCorner = opts.keybindCorner === "bottom" ? "bottom" : "top";

  const container = scene.add.container(0, 0);
  const graphics = scene.add.graphics();
  const labelText = scene.add.text(w / 2, h / 2, label, {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${df.sideButtonFontSize}px`,
    color: darkFantasyPalette.textPrimary,
  });
  labelText.setOrigin(0.5, 0.5);
  labelText.setVisible(!isHamburger);

  const keybindText = scene.add.text(0, 0, opts.keybindLabel ?? "", {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${df.keybindFontSize}px`,
    color: darkFantasyPalette.textPrimary,
    stroke: "#000000",
    strokeThickness: 2,
  });
  if (keybindCorner === "top") {
    keybindText.setOrigin(1, 0);
    keybindText.setPosition(w - 4, 4);
  } else {
    keybindText.setOrigin(1, 1);
    keybindText.setPosition(w - 4, h - 3);
  }
  keybindText.setVisible(Boolean(opts.keybindLabel));

  const zone = scene.add.zone(w / 2, h / 2, w, h);
  zone.setOrigin(0.5, 0.5);

  container.add([graphics, labelText, keybindText, zone]);

  let state = interactive ? "regular" : "disabled";

  const redraw = () => {
    drawBeveledButton(graphics, w, h, state);
    if (isHamburger) {
      drawHamburgerIcon(graphics, w / 2, h / 2, Math.min(w, h) * 0.42);
    }
    labelText.setAlpha(state === "disabled" ? 0.45 : 1);
  };

  const setState = (next) => {
    if (!interactive) {
      return;
    }
    state = next;
    redraw();
  };

  const setLabel = (text) => {
    labelText.setText(text);
  };

  const setKeybindLabel = (text) => {
    keybindText.setText(text);
    keybindText.setVisible(Boolean(text));
  };

  redraw();

  if (interactive && typeof opts.onClick === "function") {
    zone.setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => setState("hover"));
    zone.on("pointerout", () => setState("regular"));
    zone.on("pointerdown", () => {
      setState("pressed");
      opts.onClick();
    });
    zone.on("pointerup", () => setState("hover"));
  } else {
    zone.disableInteractive();
  }

  return {
    container,
    graphics,
    zone,
    labelText,
    keybindText,
    setState,
    setLabel,
    setKeybindLabel,
    width: w,
    height: h,
  };
}

/**
 * Full-width menu row for dropdown panels.
 * @param {Phaser.Scene} scene
 * @param {{ label: string, width?: number, height?: number, onClick?: () => void }} opts
 */
export function createFantasyMenuRow(scene, opts) {
  const w = opts.width ?? 280;
  const h = opts.height ?? 36;
  const label = opts.label ?? "";

  const container = scene.add.container(0, 0);
  const graphics = scene.add.graphics();
  const labelText = scene.add.text(14, h / 2, label, {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${df.sideButtonFontSize}px`,
    color: darkFantasyPalette.textPrimary,
  });
  labelText.setOrigin(0, 0.5);

  const zone = scene.add.zone(w / 2, h / 2, w, h);
  zone.setOrigin(0.5, 0.5);
  container.add([graphics, labelText, zone]);

  let state = "regular";
  let rowW = w;
  let rowH = h;

  const redraw = () => {
    drawBeveledButton(graphics, rowW, rowH, state);
    labelText.setAlpha(state === "disabled" ? 0.45 : 1);
  };

  const setSize = (nextW, nextH) => {
    rowW = Math.max(40, Math.round(nextW));
    rowH = Math.max(28, Math.round(nextH));
    labelText.setPosition(14, rowH / 2);
    zone.setSize(rowW, rowH);
    zone.setPosition(rowW / 2, rowH / 2);
    redraw();
  };

  const setState = (next) => {
    state = next;
    redraw();
  };

  redraw();

  if (typeof opts.onClick === "function") {
    zone.setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => setState("hover"));
    zone.on("pointerout", () => setState("regular"));
    zone.on("pointerdown", () => {
      setState("pressed");
      opts.onClick();
    });
    zone.on("pointerup", () => setState("hover"));
  }

  return {
    container,
    setSize,
    setState,
    setPosition(x, y) {
      container.setPosition(x, y);
    },
    setVisible(visible) {
      container.setVisible(visible);
    },
    get width() {
      return rowW;
    },
    get height() {
      return rowH;
    },
  };
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} size
 * @param {string} [keybindLabel]
 */
export function createFantasyActionSlot(scene, size, keybindLabel = "") {
  const container = scene.add.container(0, 0);
  const frameG = scene.add.graphics();
  const glowG = scene.add.graphics();
  glowG.setVisible(false);

  const keybindText = scene.add.text(0, 0, keybindLabel, {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${df.keybindFontSize}px`,
    color: darkFantasyPalette.textPrimary,
    stroke: "#000000",
    strokeThickness: 2,
  });
  keybindText.setOrigin(1, 1);

  container.add([glowG, frameG, keybindText]);

  let slotSize = size;
  let visualState = "regular";
  let glowColor = darkFantasyPalette.slotGlow;
  let glowAlpha = 0;

  const positionKeybindText = () => {
    keybindText.setPosition(slotSize - 4, slotSize - 3);
  };

  const drawFrame = () => {
    frameG.clear();
    const inset = 2;
    const inner = slotSize - inset * 2;
    let border = darkFantasyPalette.slotBorder;
    let fill = darkFantasyPalette.slotBase;
    if (visualState === "hover") {
      border = darkFantasyPalette.slotBorderHi;
      fill = 0x1c1a26;
    } else if (visualState === "pressed") {
      border = darkFantasyPalette.slotBorder;
      fill = darkFantasyPalette.slotInset;
    }
    frameG.fillStyle(darkFantasyPalette.slotInset, 1);
    frameG.fillRect(0, 0, slotSize, slotSize);
    frameG.fillStyle(fill, 1);
    frameG.fillRect(inset, inset, inner, inner);
    frameG.lineStyle(1, darkFantasyPalette.trayShadow, 0.9);
    frameG.strokeRect(inset + 0.5, inset + 0.5, inner - 1, inner - 1);
    frameG.lineStyle(1, border, 1);
    frameG.strokeRect(inset, inset, inner, inner);
  };

  const drawGlow = () => {
    glowG.clear();
    if (glowAlpha <= 0) {
      glowG.setVisible(false);
      return;
    }
    glowG.setVisible(true);
    const pad = 4;
    glowG.fillStyle(glowColor, glowAlpha);
    glowG.fillRect(pad, pad, slotSize - pad * 2, slotSize - pad * 2);
  };

  const setKeybindLabel = (text) => {
    keybindText.setText(text);
    keybindText.setVisible(Boolean(text));
  };

  const setSize = (nextSize) => {
    const n = Math.max(32, Math.round(Number(nextSize) || slotSize));
    if (n === slotSize) {
      return;
    }
    slotSize = n;
    positionKeybindText();
    drawFrame();
    drawGlow();
  };

  const setState = (next) => {
    visualState = next;
    drawFrame();
  };

  const setGlowColor = (color, alpha = 0.34) => {
    glowColor = Number.isFinite(color) ? color : darkFantasyPalette.slotGlow;
    glowAlpha = alpha;
    drawGlow();
  };

  const setEmpty = (empty) => {
    setGlowColor(darkFantasyPalette.slotBorder, empty ? 0.08 : glowAlpha);
    drawFrame();
  };

  positionKeybindText();
  drawFrame();

  return {
    container,
    frameG,
    glowG,
    keybindText,
    setState,
    setGlowColor,
    setEmpty,
    setKeybindLabel,
    setSize,
    get size() {
      return slotSize;
    },
  };
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ width?: number, height?: number, fillColor?: number, fillColorHi?: number }} [opts]
 */
export function createResourceBar(scene, opts = {}) {
  const width = opts.width ?? 160;
  const height = opts.height ?? df.barHeight;
  const fillColor = opts.fillColor ?? darkFantasyPalette.hpFill;
  const fillColorHi = opts.fillColorHi ?? darkFantasyPalette.hpFillHi;

  const container = scene.add.container(0, 0);
  const trackG = scene.add.graphics();
  const fillG = scene.add.graphics();
  const labelText = scene.add.text(width / 2, height / 2, "", {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: `${df.barLabelFontSize}px`,
    color: darkFantasyPalette.textPrimary,
    stroke: "#000000",
    strokeThickness: 2,
  });
  labelText.setOrigin(0.5, 0.5);

  container.add([trackG, fillG, labelText]);

  let ratio = 1;

  const redrawTrack = () => {
    trackG.clear();
    trackG.fillStyle(darkFantasyPalette.barTrack, 1);
    trackG.fillRect(0, 0, width, height);
    trackG.lineStyle(1, darkFantasyPalette.barTrackStroke, 1);
    trackG.strokeRect(0.5, 0.5, width - 1, height - 1);
    trackG.lineStyle(1, darkFantasyPalette.trayShadow, 0.7);
    trackG.beginPath();
    trackG.moveTo(1, height - 1);
    trackG.lineTo(width - 1, height - 1);
    trackG.lineTo(width - 1, 1);
    trackG.strokePath();
  };

  const redrawFill = () => {
    fillG.clear();
    const pad = 2;
    const innerW = Math.max(0, width - pad * 2);
    const innerH = height - pad * 2;
    const fillW = Math.max(0, Math.round(innerW * ratio));
    if (fillW <= 0) {
      return;
    }
    fillG.fillStyle(fillColor, 1);
    fillG.fillRect(pad, pad, fillW, innerH);
    if (fillW > 4) {
      fillG.fillStyle(fillColorHi, 0.35);
      fillG.fillRect(pad, pad, fillW, Math.max(2, Math.floor(innerH * 0.35)));
    }
  };

  const setRatio = (r) => {
    ratio = Math.max(0, Math.min(1, Number(r) || 0));
    redrawFill();
  };

  const setLabel = (text) => {
    labelText.setText(text);
  };

  redrawTrack();
  redrawFill();

  return { container, setRatio, setLabel, width, height };
}

/**
 * @param {Phaser.Scene} scene
 */
export function createBarPageSelector(scene) {
  const w = df.pageSelectorW;
  const h = df.pageSelectorH;
  const container = scene.add.container(0, 0);
  const bg = scene.add.graphics();
  drawBeveledButton(bg, w, h, "disabled");
  bg.setAlpha(0.85);

  const pageText = scene.add.text(w / 2, h / 2, "1", {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: "13px",
    color: darkFantasyPalette.textMuted,
  });
  pageText.setOrigin(0.5, 0.5);

  const upLabel = scene.add.text(w / 2, 4, "▲", {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: "8px",
    color: darkFantasyPalette.textMuted,
  });
  upLabel.setOrigin(0.5, 0);
  const downLabel = scene.add.text(w / 2, h - 6, "▼", {
    fontFamily: cozyTheme.typography.bodyFamily,
    fontSize: "8px",
    color: darkFantasyPalette.textMuted,
  });
  downLabel.setOrigin(0.5, 1);

  container.add([bg, upLabel, pageText, downLabel]);
  return { container, width: w, height: h };
}

/**
 * @param {Phaser.Scene} scene
 */
export function createBottomBarChrome(scene) {
  const root = scene.add.container(0, 0);
  const frameG = scene.add.graphics();

  const leftRail = scene.add.container(0, 0);
  const rightRail = scene.add.container(0, 0);
  const centerPanel = scene.add.container(0, 0);
  const actionHost = scene.add.container(0, 0);

  const leftDivider = scene.add.graphics();
  const rightDivider = scene.add.graphics();

  const livesBar = createResourceBar(scene, {
    width: df.resourceBarWidth,
    height: df.barHeight,
    fillColor: darkFantasyPalette.hpFill,
    fillColorHi: darkFantasyPalette.hpFillHi,
  });
  const goldBar = createResourceBar(scene, {
    width: df.resourceBarWidth,
    height: df.barHeight,
    fillColor: darkFantasyPalette.goldFill,
    fillColorHi: darkFantasyPalette.goldFillHi,
  });

  const barsRow = scene.add.container(0, 0);
  barsRow.add([livesBar.container, goldBar.container]);

  const pageSelector = createBarPageSelector(scene);

  centerPanel.add([barsRow, pageSelector.container, actionHost]);

  root.add([frameG, leftDivider, leftRail, centerPanel, rightDivider, rightRail]);

  return {
    root,
    frameG,
    leftRail,
    rightRail,
    centerPanel,
    actionHost,
    leftDivider,
    rightDivider,
    livesBar,
    goldBar,
    barsRow,
    pageSelector,
  };
}

/**
 * Draw vertical stone pilaster divider.
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} h
 */
export function drawVerticalDivider(g, h) {
  const w = df.dividerW;
  g.clear();
  g.fillStyle(darkFantasyPalette.divider, 1);
  g.fillRect(0, 0, w, h);
  g.lineStyle(1, darkFantasyPalette.trayHighlight, 0.5);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
}
