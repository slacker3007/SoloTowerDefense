import { TILE_SIZE } from "./constants";
import { BUILDING_ASSETS } from "./generated/buildingCatalog.js";
import { PROP_ASSETS } from "./generated/propCatalog.js";
import { TERRAIN_TILESET_ASSETS } from "./generated/terrainTilesetCatalog.js";
import { UI_ASSETS } from "./generated/uiCatalog.js";
import { UNIT_ASSETS } from "./generated/unitCatalog.js";

const tinySwordsRoot = "TinySwords";

const terrainRoot = `${tinySwordsRoot}/Terrain/Tileset`;
const barsRoot = `${tinySwordsRoot}/UI Elements/UI Elements/Bars`;
const elementIconsRoot = `${tinySwordsRoot}/UI Elements/UI Elements/Element_Icons`;
const particleFxRoot = `${tinySwordsRoot}/Particle FX`;
const terrainResourcesRoot = `${tinySwordsRoot}/Terrain/Resources/Meat/Sheep`;

/** Matches `tileOverrideSchema.SHEEP_IDLE_SHEET_KEY` */
export const SHEEP_IDLE_SHEET_KEY = "sheepIdleSheet";
export const SHEEP_IDLE_ANIM_KEY = "sheep-idle";
export const SHEEP_MOVE_SHEET_KEY = "sheepMoveSheet";
export const SHEEP_MOVE_ANIM_KEY = "sheep-move";

export const terrainSpriteSheets = TERRAIN_TILESET_ASSETS.map((asset) => ({
  key: asset.key,
  path: asset.path,
  frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
}));

export const spriteSheets = [
  ...terrainSpriteSheets,
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
    key: "redWarriorIdleSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Warrior/Warrior_Idle.png`,
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
  {
    key: "blackWarriorRunSheet",
    path: `${tinySwordsRoot}/Units/Black Units/Warrior/Warrior_Run.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "bluePawnRunHammerSheet",
    path: `${tinySwordsRoot}/Units/Blue Units/Pawn/Pawn_Run Hammer.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "bluePawnInteractHammerSheet",
    path: `${tinySwordsRoot}/Units/Blue Units/Pawn/Pawn_Interact Hammer.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "blueWarriorIdleSheet",
    path: `${tinySwordsRoot}/Units/Blue Units/Warrior/Warrior_Idle.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "blueArcherIdleSheet",
    path: `${tinySwordsRoot}/Units/Blue Units/Archer/Archer_Idle.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: "blueLancerIdleSheet",
    path: `${tinySwordsRoot}/Units/Blue Units/Lancer/Lancer_Idle.png`,
    frameConfig: { frameWidth: 320, frameHeight: 320 },
  },
  {
    key: "fire01Sheet",
    path: `${particleFxRoot}/Fire_01.png`,
    frameConfig: { frameWidth: 64, frameHeight: 64 },
  },
  {
    key: "fxDust02",
    path: `${particleFxRoot}/Dust_02.png`,
    frameConfig: { frameWidth: 64, frameHeight: 64 },
  },
  {
    key: SHEEP_IDLE_SHEET_KEY,
    path: `${terrainResourcesRoot}/Sheep_Idle.png`,
    frameConfig: { frameWidth: 128, frameHeight: 128 },
  },
  {
    key: SHEEP_MOVE_SHEET_KEY,
    path: `${terrainResourcesRoot}/Sheep_Move.png`,
    frameConfig: { frameWidth: 128, frameHeight: 128 },
  },
  /** BigBar_Base 320×64 = (5×64)×64: frames 0=left, 2=tile middle (repeat), 4=right; 1 and 3 are blank. */
  {
    key: "bigBarBase",
    path: `${barsRoot}/BigBar_Base.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "buttonBigBlueBase",
    path: `${tinySwordsRoot}/UI Elements/UI Elements/Buttons/BigBlueButton_Regular.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
  {
    key: "buttonBigBluePressed",
    path: `${tinySwordsRoot}/UI Elements/UI Elements/Buttons/BigBlueButton_Pressed.png`,
    frameConfig: { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE },
  },
];

const barracksMapKeys = new Set(["barracks_blue", "barracks_red"]);
const buildingImages = BUILDING_ASSETS.filter((asset) => !barracksMapKeys.has(asset.key)).map((asset) => ({
  key: asset.key,
  path: asset.path,
}));

export const standaloneImages = [
  { key: "gameLogo", path: `${tinySwordsRoot}/logo.png` },
  { key: "waterBackground", path: `${terrainRoot}/Water Background color.png` },
  { key: "blueBarracks", path: `${tinySwordsRoot}/Buildings/Blue Buildings/Barracks.png` },
  { key: "redBarracks", path: `${tinySwordsRoot}/Buildings/Red Buildings/Barracks.png` },
  ...buildingImages,
  { key: "buildIcon01", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_01.png` },
  { key: "buildIcon05", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_05.png` },
  { key: "buildIcon06", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_06.png` },
  { key: "hammerIcon08", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_08.png` },
  { key: "sellIcon03", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_03.png` },
  { key: "detailsCloseIcon09", path: `${tinySwordsRoot}/UI Elements/UI Elements/Icons/Icon_09.png` },
  { key: "tower_archer_icon", path: `${elementIconsRoot}/tower_archer_icon.png` },
  { key: "tower_lightning_icon", path: `${elementIconsRoot}/tower_lightning_icon.png` },
  { key: "tower_earth_icon", path: `${elementIconsRoot}/tower_earth_icon.png` },
  { key: "tower_fire_icon", path: `${elementIconsRoot}/tower_fire_icon.png` },
  { key: "tower_holy_icon", path: `${elementIconsRoot}/tower_holy_icon.png` },
  { key: "tower_ice_icon", path: `${elementIconsRoot}/tower_ice_icon.png` },
  { key: "tower_dark_icon", path: `${elementIconsRoot}/tower_dark_icon.png` },
  { key: "tower_nature_icon", path: `${elementIconsRoot}/tower_nature_icon.png` },
  { key: "bigBarFill", path: `${barsRoot}/BigBar_Fill.png` },
  { key: "fxExplosion01", path: `${particleFxRoot}/Explosion_01.png` },
  { key: "fxExplosion02", path: `${particleFxRoot}/Explosion_02.png` },
  { key: "fxDust01", path: `${particleFxRoot}/Dust_01.png` },
  { key: "fxSplash", path: `${particleFxRoot}/Water Splash.png` },
  { key: "waterFoam", path: `${terrainRoot}/Water Foam.png` },
];

export const animationDefaults = {
  frameRate: 10,
  repeat: -1,
};

export const terrainFrameDefaults = {
  grassInteriorFrame: 0,
};

function preloadCatalogAssets(scene, assets, loadedSheets, loadedImages) {
  for (const asset of assets) {
    if (loadedSheets.has(asset.key) || loadedImages.has(asset.key)) {
      continue;
    }
    if (asset.frameCount > 1) {
      scene.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameW,
        frameHeight: asset.frameH,
      });
      loadedSheets.add(asset.key);
    } else {
      scene.load.image(asset.key, asset.path);
      loadedImages.add(asset.key);
    }
  }
}

export function preloadTinySwords(scene) {
  const loadedSheets = new Set(spriteSheets.map((sheet) => sheet.key));
  const loadedImages = new Set(standaloneImages.map((image) => image.key));

  for (const sheet of spriteSheets) {
    scene.load.spritesheet(sheet.key, sheet.path, sheet.frameConfig);
  }

  for (const image of standaloneImages) {
    scene.load.image(image.key, image.path);
  }

  preloadCatalogAssets(scene, PROP_ASSETS, loadedSheets, loadedImages);
  preloadCatalogAssets(scene, UNIT_ASSETS, loadedSheets, loadedImages);
  preloadCatalogAssets(scene, UI_ASSETS, loadedSheets, loadedImages);
}

export function createTinySwordsAnimations(scene) {
  const createRunLoop = (sheetKey, animationKey, explicitEndFrame = null) => {
    if (!scene.textures.exists(sheetKey) || scene.anims.exists(animationKey)) {
      return;
    }
    const totalFrames = scene.textures.get(sheetKey).frameTotal;
    const computedEndFrame = Math.max(0, totalFrames - 1);
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
  createRunLoop("redWarriorIdleSheet", "red-warrior-idle");
  createRunLoop("redLancerRunSheet", "red-lancer-run", 5);
  createRunLoop("redMonkRunSheet", "red-monk-run");
  createRunLoop("redArcherRunSheet", "red-archer-run");
  createRunLoop("blackWarriorRunSheet", "black-warrior-run");
  createRunLoop("bluePawnRunHammerSheet", "blue-pawn-run-hammer");
  createRunLoop("bluePawnInteractHammerSheet", "blue-pawn-interact-hammer");
  createRunLoop("blueWarriorIdleSheet", "blue-warrior-idle");
  createRunLoop("blueArcherIdleSheet", "blue-archer-idle");
  createRunLoop("blueLancerIdleSheet", "blue-lancer-idle");
  createRunLoop("fire01Sheet", "fire-01-loop", 7);
  if (scene.textures.exists("fxDust02") && !scene.anims.exists("fx-dust-02")) {
    scene.anims.create({
      key: "fx-dust-02",
      frames: scene.anims.generateFrameNumbers("fxDust02", { start: 0, end: 9 }),
      frameRate: 24,
      repeat: 0,
    });
  }
  createRunLoop(SHEEP_IDLE_SHEET_KEY, SHEEP_IDLE_ANIM_KEY, 5);
  createRunLoop(SHEEP_MOVE_SHEET_KEY, SHEEP_MOVE_ANIM_KEY, 5);
}

export function hasTinySwordsFolderHint(scene) {
  return scene.textures.exists("terrainColor1");
}
