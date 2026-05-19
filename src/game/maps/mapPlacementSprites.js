import { TILE_SIZE } from "../constants";
import { SHEEP_IDLE_ANIM_KEY, SHEEP_IDLE_SHEET_KEY } from "../assets";
import { getPropAsset } from "../props/propCatalog";
import { getUiAsset } from "../ui/uiCatalog";
import { getUnitAsset } from "../units/unitCatalog";
import { DECORATION_IMAGE_KEYS } from "./tileOverrideSchema";

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {{ sheet: string, frame: number }} placement
 * @param {number} cellX
 * @param {number} cellY
 * @param {number} depth
 */
export function addPropDecorationSprite(scene, container, placement, cellX, cellY, depth) {
  const key = placement.sheet;
  if (!scene.textures.exists(key)) {
    return;
  }
  const px = cellX * TILE_SIZE;
  const py = cellY * TILE_SIZE;
  const frame = Math.max(0, Math.floor(placement.frame));
  const asset = getPropAsset(key);

  if (key === SHEEP_IDLE_SHEET_KEY) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, key, 0);
    spr.setDisplaySize(TILE_SIZE, TILE_SIZE);
    spr.setDepth(depth);
    if (scene.anims.exists(SHEEP_IDLE_ANIM_KEY)) {
      spr.play(SHEEP_IDLE_ANIM_KEY, false, Phaser.Math.Clamp(frame, 0, 5));
    }
    container.add(spr);
    return;
  }

  if (DECORATION_IMAGE_KEYS.includes(key)) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, key, frame);
    spr.setOrigin(0.5, 1);
    spr.setDisplaySize(TILE_SIZE * 2, TILE_SIZE * 3);
    spr.setDepth(depth);
    container.add(spr);
    return;
  }

  const tall = asset && asset.height > asset.width * 1.2;
  if (tall || (asset && asset.frameCount === 1 && asset.height > TILE_SIZE)) {
    const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, key, frame);
    spr.setOrigin(0.5, 1);
    const scale = Math.min(TILE_SIZE / (asset?.frameW ?? TILE_SIZE), (TILE_SIZE * 2) / (asset?.height ?? TILE_SIZE));
    spr.setDisplaySize((asset?.width ?? TILE_SIZE) * scale, (asset?.height ?? TILE_SIZE) * scale);
    spr.setDepth(depth);
    container.add(spr);
    return;
  }

  const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE / 2, key, frame);
  spr.setDisplaySize(TILE_SIZE, TILE_SIZE);
  spr.setDepth(depth);
  container.add(spr);
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {{ assetKey: string, frame: number }} placement
 * @param {number} cellX
 * @param {number} cellY
 * @param {number} depth
 * @param {"unit" | "ui"} kind
 */
export function addCatalogPlacementSprite(scene, container, placement, cellX, cellY, depth, kind) {
  const key = placement.assetKey;
  if (!scene.textures.exists(key)) {
    return;
  }
  const asset = kind === "unit" ? getUnitAsset(key) : getUiAsset(key);
  const px = cellX * TILE_SIZE;
  const py = cellY * TILE_SIZE;
  const frame = Math.max(0, Math.floor(placement.frame));
  const fw = asset?.frameW ?? TILE_SIZE;
  const fh = asset?.frameH ?? TILE_SIZE;
  const spr = scene.add.sprite(px + TILE_SIZE / 2, py + TILE_SIZE, key, frame);
  spr.setOrigin(0.5, 1);
  const targetH = kind === "ui" ? TILE_SIZE * 0.75 : Math.min(TILE_SIZE * 2, fh);
  const scale = targetH / fh;
  spr.setDisplaySize(fw * scale, fh * scale);
  spr.setDepth(depth);
  container.add(spr);
}
