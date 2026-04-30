import { TILE_SIZE } from "./constants";

const tinySwordsRoot = "TinySwords";

const terrainRoot = `${tinySwordsRoot}/Terrain/Tileset`;
const barsRoot = `${tinySwordsRoot}/UI Elements/UI Elements/Bars`;
const elementIconsRoot = `${tinySwordsRoot}/UI Elements/UI Elements/Element_Icons`;
const elementalBuildingsRoot = `${tinySwordsRoot}/Buildings/Elemental Buildings notog`;

export const spriteSheets = [
  {
    key: "terrainColor1",
    path: `${terrainRoot}/Tilemap_color1.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "terrainColor2",
    path: `${terrainRoot}/Tilemap_color2.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "terrainColor3",
    path: `${terrainRoot}/Tilemap_color3.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "terrainColor4",
    path: `${terrainRoot}/Tilemap_color4.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "terrainColor5",
    path: `${terrainRoot}/Tilemap_color5.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "terrainColor6",
    path: `${terrainRoot}/Tilemap_color6.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "waterFoamSheet",
    path: `${terrainRoot}/Water Foam.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "shadowSheet",
    path: `${terrainRoot}/Shadow.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "woodTablePixelMap",
    path: `${tinySwordsRoot}/UI Elements/UI Elements/Wood Table/WoodTable.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "redWarriorRunSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Warrior/Warrior_Run.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "redLancerRunSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Lancer/Lancer_Run.png`,
    frameConfig: { frameWidth: 320, frameHeight: 320 },
  },
  {
    key: "redMonkRunSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Monk/Run.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "redArcherRunSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Archer/Archer_Run.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  /** BigBar_Base 320×64 = (5×64)×64: frames 0=left, 2=tile middle (repeat), 4=right; 1 and 3 are blank. */
  {
    key: "bigBarBase",
    path: `${barsRoot}/BigBar_Base.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
];

export const standaloneImages = [
  { key: "waterBackground", path: `${terrainRoot}/Water Background color.png` },
  { key: "blueBarracks", path: `${tinySwordsRoot}/Buildings/Blue Buildings/Barracks.png` },
  { key: "redBarracks", path: `${tinySwordsRoot}/Buildings/Red Buildings/Barracks.png` },
  { key: "blueTower", path: `${tinySwordsRoot}/Buildings/Blue Buildings/Tower.png` },
  { key: "tower_archer_building", path: `${elementalBuildingsRoot}/archer_tower.png` },
  { key: "tower_lightning_building", path: `${elementalBuildingsRoot}/lightning_tower.png` },
  { key: "tower_earth_building", path: `${elementalBuildingsRoot}/earth_tower.png` },
  { key: "tower_fire_building", path: `${elementalBuildingsRoot}/fire_tower.png` },
  { key: "tower_holy_building", path: `${elementalBuildingsRoot}/holy_tower.png` },
  { key: "tower_ice_building", path: `${elementalBuildingsRoot}/ice_tower.png` },
  { key: "tower_dark_building", path: `${elementalBuildingsRoot}/dark_tower.png` },
  { key: "tower_nature_building", path: `${elementalBuildingsRoot}/nature_tower.png` },
  { key: "buildIcon01", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_01.png` },
  { key: "buildIcon05", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_05.png` },
  { key: "buildIcon06", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_06.png` },
  { key: "hammerIcon08", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_08.png` },
  { key: "sellIcon03", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_03.png` },
  { key: "tower_archer_icon", path: `${elementIconsRoot}/tower_archer_icon.png` },
  { key: "tower_lightning_icon", path: `${elementIconsRoot}/tower_lightning_icon.png` },
  { key: "tower_earth_icon", path: `${elementIconsRoot}/tower_earth_icon.png` },
  { key: "tower_fire_icon", path: `${elementIconsRoot}/tower_fire_icon.png` },
  { key: "tower_holy_icon", path: `${elementIconsRoot}/tower_holy_icon.png` },
  { key: "tower_ice_icon", path: `${elementIconsRoot}/tower_ice_icon.png` },
  { key: "tower_dark_icon", path: `${elementIconsRoot}/tower_dark_icon.png` },
  { key: "tower_nature_icon", path: `${elementIconsRoot}/tower_nature_icon.png` },
  { key: "bigBarFill", path: `${barsRoot}/BigBar_Fill.png` },
];

export const animationDefaults = {
  frameRate: 10,
  repeat: -1,
};

export const terrainFrameDefaults = {
  grassInteriorFrame: 0,
};

export function preloadTinySwords(scene) {
  for (const sheet of spriteSheets) {
    scene.load.spritesheet(sheet.key, sheet.path, sheet.frameConfig);
  }

  for (const image of standaloneImages) {
    scene.load.image(image.key, image.path);
  }
}

export function createTinySwordsAnimations(scene) {
  const createRunLoop = (sheetKey, animationKey, explicitEndFrame = null) => {
    if (!scene.textures.exists(sheetKey) || scene.anims.exists(animationKey)) {
      return;
    }
    const frameCount = scene.textures.get(sheetKey).frameTotal - 1;
    const computedEndFrame = Math.max(0, frameCount - 1);
    const endFrame = Number.isInteger(explicitEndFrame)
      ? Math.max(0, Math.min(explicitEndFrame, computedEndFrame))
      : computedEndFrame;
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(sheetKey, {
        start: 0,
        end: endFrame,
      }),
      frameRate: 10,
      repeat: -1,
    });
  };

  createRunLoop("redWarriorRunSheet", "red-warrior-run");
  createRunLoop("redLancerRunSheet", "red-lancer-run", 5);
  createRunLoop("redMonkRunSheet", "red-monk-run");
  createRunLoop("redArcherRunSheet", "red-archer-run");
}

export function hasTinySwordsFolderHint(scene) {
  return scene.textures.exists("terrainColor1");
}
