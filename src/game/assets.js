import { TILE_SIZE } from "./constants";

const tinySwordsRoot = "TinySwords";

const terrainRoot = `${tinySwordsRoot}/Terrain/Tileset`;

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
    key: "redWarriorRunSheet",
    path: `${tinySwordsRoot}/Units/Red Units/Warrior/Warrior_Run.png`,
    frameConfig: { frameWidth: 192, frameHeight: 192 },
  },
];

export const standaloneImages = [
  { key: "waterBackground", path: `${terrainRoot}/Water Background color.png` },
  { key: "blueBarracks", path: `${tinySwordsRoot}/Buildings/Blue Buildings/Barracks.png` },
  { key: "redBarracks", path: `${tinySwordsRoot}/Buildings/Red Buildings/Barracks.png` },
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
  if (scene.textures.exists("redWarriorRunSheet") && !scene.anims.exists("red-warrior-run")) {
    const warriorFrameCount = scene.textures.get("redWarriorRunSheet").frameTotal - 1;
    scene.anims.create({
      key: "red-warrior-run",
      frames: scene.anims.generateFrameNumbers("redWarriorRunSheet", {
        start: 0,
        end: Math.max(0, warriorFrameCount - 1),
      }),
      frameRate: 10,
      repeat: -1,
    });
  }
}

export function hasTinySwordsFolderHint(scene) {
  return scene.textures.exists("terrainColor1");
}
