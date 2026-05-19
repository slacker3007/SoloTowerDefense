import { TILE_SIZE } from "../constants";
import { BUILDING_ASSETS, BUILDING_BY_KEY } from "../generated/buildingCatalog.js";

export { BUILDING_ASSETS, BUILDING_BY_KEY };

/**
 * @param {string} key
 */
export function getBuildingAsset(key) {
  return BUILDING_BY_KEY[key] ?? null;
}

/**
 * @param {string} key
 */
export function isBarracksBuildingKey(key) {
  return key === "barracks_blue" || key === "barracks_red";
}

/** Original Phaser texture keys for barracks (unchanged size/position). */
export function getBarracksTextureKey(buildingKey) {
  if (buildingKey === "barracks_blue") {
    return "blueBarracks";
  }
  if (buildingKey === "barracks_red") {
    return "redBarracks";
  }
  return null;
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} container
 * @param {string} buildingKey
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [depth]
 */
export function addBuildingToContainer(scene, container, buildingKey, worldX, worldY, depth = 20) {
  if (isBarracksBuildingKey(buildingKey)) {
    const textureKey = getBarracksTextureKey(buildingKey);
    if (textureKey && scene.textures.exists(textureKey)) {
      const img = scene.add.image(worldX, worldY, textureKey);
      img.setDepth(depth);
      container.add(img);
      return;
    }
    const color = buildingKey === "barracks_blue" ? 0x355bb7 : 0xb43b3b;
    const rect = scene.add.rectangle(worldX, worldY, TILE_SIZE - 8, TILE_SIZE - 8, color);
    rect.setDepth(depth);
    container.add(rect);
    return;
  }

  const asset = getBuildingAsset(buildingKey);
  const textureKey = asset?.key ?? buildingKey;
  if (!scene.textures.exists(textureKey)) {
    const rect = scene.add.rectangle(worldX, worldY, TILE_SIZE - 8, TILE_SIZE - 8, 0x6a7a94);
    rect.setDepth(depth);
    container.add(rect);
    return;
  }
  const img = scene.add.image(worldX, worldY, textureKey);
  const src = scene.textures.get(textureKey).getSourceImage();
  const natW = src?.width ?? asset?.width ?? TILE_SIZE;
  const natH = src?.height ?? asset?.height ?? TILE_SIZE;
  const maxDim = Math.max(TILE_SIZE * 2, 160);
  if (natW > maxDim || natH > maxDim) {
    const scale = maxDim / Math.max(natW, natH);
    img.setDisplaySize(natW * scale, natH * scale);
  }
  if (natH > natW * 1.1) {
    img.setOrigin(0.5, 1);
    img.y = worldY + TILE_SIZE / 2;
  } else {
    img.setOrigin(0.5, 0.5);
  }
  img.setDepth(depth);
  container.add(img);
}
