import { TILE_SIZE } from "../constants";

/**
 * BigBar_Base.png is 320×64 = five 64×64 columns in one row (5×64)×64.
 * Use frames 0 (left), 2 (tileable middle, repeat), 4 (right). Frames 1 and 3 are empty spacers in the sheet.
 */
const BASE_KEY = "bigBarBase";
const FILL_KEY = "bigBarFill";
const FRAME_LEFT = 0;
const FRAME_MID = 2;
const FRAME_RIGHT = 4;

/** Middle section width in world pixels (64px tiles). */
const MID_DISPLAY_W = 192;

/** Edge-to-edge fill inset across the full assembled base width. */
const FILL_EDGE_INSET_X = 52;
/** BigBar_Fill visible paint band in source texture (64x64). */
const FILL_SRC_Y = 20;
const FILL_SRC_H = 24;
/** User-preferred full-height render for the 64x64 fill asset. */
const FILL_DISPLAY_H = 64;
const FILL_TEX = TILE_SIZE;

/**
 * @param {Phaser.Scene} scene
 * @param {number} worldX
 * @param {number} worldY
 * @returns {{ container: Phaser.GameObjects.Container, setRatio: (r: number) => void, setValues: (current: number, max: number) => void, destroy: () => void } | null}
 */
export function createBlueBarracksHpBar(scene, worldX, worldY) {
  if (!scene.textures.exists(BASE_KEY) || !scene.textures.exists(FILL_KEY)) {
    return null;
  }

  const capW = TILE_SIZE;
  const totalW = capW + MID_DISPLAY_W + capW;
  // User preference: fill spans from left outer edge to right outer edge.
  const innerW = Math.max(1, totalW - FILL_EDGE_INSET_X * 2);
  const innerLeft = -totalW / 2 + FILL_EDGE_INSET_X;

  const container = scene.add.container(worldX, worldY);
  container.setDepth(24);

  const baseParts = [];
  let x = -totalW / 2;

  const left = scene.add.image(x + capW / 2, 0, BASE_KEY, FRAME_LEFT);
  left.setOrigin(0.5, 0.5);
  baseParts.push(left);
  x += capW;

  const midTiles = Math.ceil(MID_DISPLAY_W / TILE_SIZE);
  for (let i = 0; i < midTiles; i += 1) {
    const pieceW = Math.min(TILE_SIZE, MID_DISPLAY_W - i * TILE_SIZE);
    const mid = scene.add.image(x + pieceW / 2, 0, BASE_KEY, FRAME_MID);
    mid.setOrigin(0.5, 0.5);
    // Crops frame 2 (tile middle) if MID_DISPLAY_W is not a multiple of 64.
    if (pieceW < TILE_SIZE) {
      mid.setCrop(0, 0, pieceW, TILE_SIZE);
    }
    baseParts.push(mid);
    x += pieceW;
  }

  const right = scene.add.image(x + capW / 2, 0, BASE_KEY, FRAME_RIGHT);
  right.setOrigin(0.5, 0.5);
  baseParts.push(right);

  /** Image fill (not TileSprite): stable size inside nested containers in Phaser 3. */
  const fill = scene.add.image(innerLeft, 0, FILL_KEY);
  fill.setOrigin(0, 0.5);
  const hpLabel = scene.add.text(0, 0, "", {
    fontFamily: "Arial",
    fontSize: "18px",
    color: "#eaf2ff",
    stroke: "#0b1526",
    strokeThickness: 3,
  });
  hpLabel.setOrigin(0.5, 0.5);

  // Middle frame interior is opaque in this sheet, so fill must render above frame to be visible.
  for (const p of baseParts) {
    container.add(p);
  }
  container.add(fill);
  container.add(hpLabel);

  /** @type {number} */
  let ratio = 1;

  const applyFill = () => {
    const rw = Math.max(0, innerW * ratio);
    if (rw < 0.5) {
      fill.setVisible(false);
      return;
    }
    fill.setVisible(true);
    const u = Math.max(1, FILL_TEX * ratio);
    fill.setCrop(0, FILL_SRC_Y, u, FILL_SRC_H);
    fill.setDisplaySize(rw, FILL_DISPLAY_H);
    fill.setPosition(innerLeft, 0);
  };

  applyFill();

  return {
    container,
    setRatio(r) {
      ratio = Phaser.Math.Clamp(r, 0, 1);
      applyFill();
    },
    setValues(current, max) {
      const clampedMax = Math.max(1, Math.floor(max));
      const clampedCurrent = Math.max(0, Math.floor(current));
      hpLabel.setText(`${clampedCurrent}/${clampedMax}`);
    },
    destroy() {
      container.destroy(true);
    },
  };
}

/** Vertical offset above cell center (world pixels). */
export function blueBarracksHpBarYOffset() {
  return TILE_SIZE * 0.55;
}
