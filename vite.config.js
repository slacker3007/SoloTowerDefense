import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tinySwordsDir = path.join(__dirname, "TinySwords");
const terrainTilesetDir = path.join(tinySwordsDir, "Terrain", "Tileset");
const buildingsDir = path.join(tinySwordsDir, "Buildings");
const terrainTilesetCatalogFile = path.join(__dirname, "src", "game", "generated", "terrainTilesetCatalog.js");
const buildingCatalogFile = path.join(__dirname, "src", "game", "generated", "buildingCatalog.js");
const propCatalogFile = path.join(__dirname, "src", "game", "generated", "propCatalog.js");
const unitCatalogFile = path.join(__dirname, "src", "game", "generated", "unitCatalog.js");
const uiCatalogFile = path.join(__dirname, "src", "game", "generated", "uiCatalog.js");
const propsDecorationsDir = path.join(tinySwordsDir, "Terrain", "Decorations");
const propsResourcesDir = path.join(tinySwordsDir, "Terrain", "Resources");
const propsParticleDir = path.join(tinySwordsDir, "Particle FX");
const unitsDir = path.join(tinySwordsDir, "Units");
const uiElementsDir = path.join(tinySwordsDir, "UI Elements");
const terrainTileSize = 64;
const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const legacyTerrainKeys = new Map([
  ["Tilemap_color1.png", "terrainColor1"],
  ["Tilemap_color2.png", "terrainColor2"],
  ["Tilemap_color3.png", "terrainColor3"],
  ["Tilemap_color4.png", "terrainColor4"],
  ["Tilemap_color5.png", "terrainColor5"],
  ["Tilemap_color6.png", "terrainColor6"],
  ["Water Foam.png", "waterFoamSheet"],
  ["Shadow.png", "shadowSheet"],
]);
/** Relative to `TinySwords/Buildings/` — stable Phaser + map keys. */
const legacyBuildingKeys = new Map([
  ["Blue Buildings/Barracks.png", "barracks_blue"],
  ["Red Buildings/Barracks.png", "barracks_red"],
  ["Blue Buildings/House2.png", "blueHouse2"],
  ["Red Buildings/House2.png", "redHouse2"],
  ["Blue Buildings/Tower.png", "blueTower"],
  ["Elemental Buildings notog/archer_tower.png", "tower_archer_building"],
  ["Elemental Buildings notog/lightning_tower.png", "tower_lightning_building"],
  ["Elemental Buildings notog/earth_tower.png", "tower_earth_building"],
  ["Elemental Buildings notog/fire_tower.png", "tower_fire_building"],
  ["Elemental Buildings notog/holy_tower.png", "tower_holy_building"],
  ["Elemental Buildings notog/ice_tower.png", "tower_ice_building"],
  ["Elemental Buildings notog/dark_tower.png", "tower_dark_building"],
  ["Elemental Buildings notog/nature_tower.png", "tower_nature_building"],
  ["Elemental Buildings notog/necro_tower.png", "tower_necro_building"],
]);

const mimeByExt = {
  ".png": "image/png",
  ".aseprite": "application/octet-stream",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

function toTerrainKey(fileName, usedKeys) {
  const legacy = legacyTerrainKeys.get(fileName);
  const base = legacy ?? `terrainTileset${path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr) => chr.toUpperCase())
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/^[a-z]/, (chr) => chr.toUpperCase())}`;
  let key = base || "terrainTileset";
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function toLabel(fileName) {
  return path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, " ");
}

function toButtonLabel(fileName, index) {
  const colorMatch = /^Tilemap_color(\d+)\.png$/i.exec(fileName);
  if (colorMatch) {
    return `C${colorMatch[1]}`;
  }
  const words = toLabel(fileName)
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");
  return initials.slice(0, 4) || `T${index + 1}`;
}

function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifSize(buffer) {
  if (buffer.length < 10 || !["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return null;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readJpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    if (offset + 4 >= buffer.length) {
      return null;
    }
    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if (offset + 2 + size > buffer.length) {
      return null;
    }
    if (size >= 8 && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + size;
  }
  return null;
}

function readWebpSize(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function readImageSize(buffer, ext) {
  if (ext === ".png") {
    return readPngSize(buffer);
  }
  if (ext === ".gif") {
    return readGifSize(buffer);
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return readJpegSize(buffer);
  }
  if (ext === ".webp") {
    return readWebpSize(buffer);
  }
  return null;
}

async function scanTerrainTilesets() {
  const dirEntries = await readdir(terrainTilesetDir, { withFileTypes: true });
  const files = dirEntries
    .filter((entry) => entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aLegacy = legacyTerrainKeys.has(a) ? [...legacyTerrainKeys.keys()].indexOf(a) : Number.POSITIVE_INFINITY;
      const bLegacy = legacyTerrainKeys.has(b) ? [...legacyTerrainKeys.keys()].indexOf(b) : Number.POSITIVE_INFINITY;
      return aLegacy === bLegacy ? a.localeCompare(b) : aLegacy - bLegacy;
    });
  const usedKeys = new Set();
  const assets = [];
  for (const fileName of files) {
    const ext = path.extname(fileName).toLowerCase();
    const buffer = await readFile(path.join(terrainTilesetDir, fileName));
    const size = readImageSize(buffer, ext);
    if (!size || size.width % terrainTileSize !== 0 || size.height % terrainTileSize !== 0) {
      continue;
    }
    const cols = size.width / terrainTileSize;
    const rows = size.height / terrainTileSize;
    assets.push({
      key: toTerrainKey(fileName, usedKeys),
      fileName,
      label: toLabel(fileName),
      buttonLabel: toButtonLabel(fileName, assets.length),
      path: `TinySwords/Terrain/Tileset/${fileName}`,
      url: `/TinySwords/Terrain/Tileset/${fileName}`,
      width: size.width,
      height: size.height,
      cols,
      rows,
      frameCount: cols * rows,
    });
  }
  return assets;
}

async function generateTerrainTilesetCatalog() {
  const assets = await scanTerrainTilesets();
  const contents = `// This file is generated by vite.config.js from TinySwords/Terrain/Tileset.\n` +
    `// Do not edit by hand.\n\n` +
    `export const TERRAIN_TILE_SIZE = ${terrainTileSize};\n\n` +
    `export const TERRAIN_TILESET_ASSETS = ${JSON.stringify(assets, null, 2)};\n\n` +
    `export const TERRAIN_TILESET_BY_KEY = Object.freeze(Object.fromEntries(TERRAIN_TILESET_ASSETS.map((asset) => [asset.key, asset])));\n`;
  await mkdir(path.dirname(terrainTilesetCatalogFile), { recursive: true });
  await writeFile(terrainTilesetCatalogFile, contents, "utf8");
}

function toBuildingKey(relativePath, usedKeys) {
  const normalized = relativePath.replace(/\\/g, "/");
  const legacy = legacyBuildingKeys.get(normalized);
  const parts = normalized.replace(/\.[^.]+$/, "").split("/");
  const base =
    legacy ??
    `building${parts
      .map((part) =>
        part
          .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr) => chr.toUpperCase())
          .replace(/^[^a-zA-Z]+/, "")
          .replace(/^[a-z]/, (chr) => chr.toUpperCase()),
      )
      .join("")}`;
  let key = base || "building";
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

function shouldSkipAssetFile(fileName) {
  if (/\.aseprite$/i.test(fileName)) {
    return true;
  }
  if (/_Highlight(\.[^.]+)?$/i.test(fileName)) {
    return true;
  }
  return false;
}

function detectFrameLayout(size) {
  const { width, height } = size;
  if (width % terrainTileSize === 0 && height % terrainTileSize === 0 && (width > terrainTileSize || height > terrainTileSize)) {
    const cols = width / terrainTileSize;
    const rows = height / terrainTileSize;
    return {
      frameW: terrainTileSize,
      frameH: terrainTileSize,
      cols,
      rows,
      frameCount: cols * rows,
    };
  }
  return { frameW: width, frameH: height, cols: 1, rows: 1, frameCount: 1 };
}

function toCatalogKey(prefix, relativePath, usedKeys) {
  const parts = relativePath
    .replace(/\.[^.]+$/, "")
    .split("/")
    .flatMap((part) =>
      part
        .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr) => chr.toUpperCase())
        .replace(/^[^a-zA-Z]+/, "")
        .split(/(?=[A-Z])/),
    )
    .filter(Boolean);
  const base = `${prefix}${parts.map((p) => p.replace(/^[a-z]/, (c) => c.toUpperCase())).join("")}`;
  let key = base || prefix;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

async function walkImageFiles(dir, baseDir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkImageFiles(abs, baseDir, out);
      continue;
    }
    if (!entry.isFile() || shouldSkipAssetFile(entry.name)) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExts.has(ext)) {
      continue;
    }
    const relativePath = path.relative(baseDir, abs).replace(/\\/g, "/");
    out.push({ abs, relativePath, fileName: entry.name, ext });
  }
}

async function walkBuildingImages(dir, baseDir, out) {
  await walkImageFiles(dir, baseDir, out);
}

async function scanBuildings() {
  const files = [];
  await walkBuildingImages(buildingsDir, buildingsDir, files);
  files.sort((a, b) => {
    const aLegacy = legacyBuildingKeys.has(a.relativePath)
      ? [...legacyBuildingKeys.keys()].indexOf(a.relativePath)
      : Number.POSITIVE_INFINITY;
    const bLegacy = legacyBuildingKeys.has(b.relativePath)
      ? [...legacyBuildingKeys.keys()].indexOf(b.relativePath)
      : Number.POSITIVE_INFINITY;
    if (aLegacy !== bLegacy) {
      return aLegacy - bLegacy;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
  const usedKeys = new Set();
  const assets = [];
  for (const file of files) {
    const buffer = await readFile(file.abs);
    const size = readImageSize(buffer, file.ext) ?? { width: 64, height: 64 };
    const slash = file.relativePath.indexOf("/");
    const category = slash >= 0 ? file.relativePath.slice(0, slash) : "Buildings";
    const urlPath = file.relativePath.split("/").map(encodeURIComponent).join("/");
    assets.push({
      key: toBuildingKey(file.relativePath, usedKeys),
      fileName: file.fileName,
      relativePath: file.relativePath,
      label: toLabel(file.fileName),
      category,
      path: `TinySwords/Buildings/${file.relativePath}`,
      url: `/TinySwords/Buildings/${urlPath}`,
      width: size.width,
      height: size.height,
    });
  }
  return assets;
}

async function generateBuildingCatalog() {
  const assets = await scanBuildings();
  const contents =
    `// This file is generated by vite.config.js from TinySwords/Buildings.\n` +
    `// Do not edit by hand.\n\n` +
    `export const BUILDING_ASSETS = ${JSON.stringify(assets, null, 2)};\n\n` +
    `export const BUILDING_BY_KEY = Object.freeze(Object.fromEntries(BUILDING_ASSETS.map((asset) => [asset.key, asset])));\n`;
  await mkdir(path.dirname(buildingCatalogFile), { recursive: true });
  await writeFile(buildingCatalogFile, contents, "utf8");
}

/**
 * @param {{ dir: string, tinyBase: string, urlBase: string }[]} roots
 * @param {string} keyPrefix
 */
async function scanImageAssetsFromRoots(roots, keyPrefix) {
  const usedKeys = new Set();
  const assets = [];
  for (const root of roots) {
    if (!fs.existsSync(root.dir)) {
      continue;
    }
    const files = [];
    await walkImageFiles(root.dir, root.dir, files);
    for (const file of files) {
      const buffer = await readFile(file.abs);
      const size = readImageSize(buffer, file.ext) ?? { width: 64, height: 64 };
      const frames = detectFrameLayout(size);
      const slash = file.relativePath.indexOf("/");
      const category = slash >= 0 ? file.relativePath.slice(0, slash) : "Root";
      const urlPath = file.relativePath.split("/").map(encodeURIComponent).join("/");
      assets.push({
        key: toCatalogKey(keyPrefix, `${root.tinyBase}/${file.relativePath}`, usedKeys),
        fileName: file.fileName,
        relativePath: file.relativePath,
        label: toLabel(file.fileName),
        category,
        path: `${root.tinyBase}/${file.relativePath}`,
        url: `${root.urlBase}${urlPath}`,
        width: size.width,
        height: size.height,
        frameW: frames.frameW,
        frameH: frames.frameH,
        cols: frames.cols,
        rows: frames.rows,
        frameCount: frames.frameCount,
      });
    }
  }
  assets.sort((a, b) => a.path.localeCompare(b.path));
  return assets;
}

async function scanProps() {
  const roots = [
    {
      dir: propsDecorationsDir,
      tinyBase: "TinySwords/Terrain/Decorations",
      urlBase: "/TinySwords/Terrain/Decorations/",
    },
    {
      dir: propsResourcesDir,
      tinyBase: "TinySwords/Terrain/Resources",
      urlBase: "/TinySwords/Terrain/Resources/",
    },
    {
      dir: propsParticleDir,
      tinyBase: "TinySwords/Particle FX",
      urlBase: "/TinySwords/Particle FX/",
    },
  ];
  return scanImageAssetsFromRoots(roots, "prop");
}

async function scanUnits() {
  const assets = await scanImageAssetsFromRoots(
    [{ dir: unitsDir, tinyBase: "TinySwords/Units", urlBase: "/TinySwords/Units/" }],
    "unit",
  );
  return assets.map((asset) => {
    const faction = asset.category.replace(/\s+Units$/i, "") || asset.category;
    return { ...asset, faction };
  });
}

async function scanUi() {
  const files = [];
  await walkImageFiles(uiElementsDir, uiElementsDir, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const usedKeys = new Set();
  const assets = [];
  for (const file of files) {
    const buffer = await readFile(file.abs);
    const size = readImageSize(buffer, file.ext) ?? { width: 64, height: 64 };
    const frames = detectFrameLayout(size);
    const parts = file.relativePath.split("/");
    const category = parts.length > 1 ? parts[0] : "UI";
    const urlPath = file.relativePath.split("/").map(encodeURIComponent).join("/");
    assets.push({
      key: toCatalogKey("ui", file.relativePath, usedKeys),
      fileName: file.fileName,
      relativePath: file.relativePath,
      label: toLabel(file.fileName),
      category,
      path: `TinySwords/UI Elements/${file.relativePath}`,
      url: `/TinySwords/UI Elements/${urlPath}`,
      width: size.width,
      height: size.height,
      frameW: frames.frameW,
      frameH: frames.frameH,
      cols: frames.cols,
      rows: frames.rows,
      frameCount: frames.frameCount,
    });
  }
  return assets;
}

async function writeCatalogModule(filePath, exportName, byKeyName, assets, comment) {
  const contents =
    `// ${comment}\n` +
    `// Do not edit by hand.\n\n` +
    `export const ${exportName} = ${JSON.stringify(assets, null, 2)};\n\n` +
    `export const ${byKeyName} = Object.freeze(Object.fromEntries(${exportName}.map((asset) => [asset.key, asset])));\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function generatePropCatalog() {
  await writeCatalogModule(
    propCatalogFile,
    "PROP_ASSETS",
    "PROP_BY_KEY",
    await scanProps(),
    "Generated by vite.config.js from TinySwords decorations, resources, and Particle FX.",
  );
}

async function generateUnitCatalog() {
  await writeCatalogModule(
    unitCatalogFile,
    "UNIT_ASSETS",
    "UNIT_BY_KEY",
    await scanUnits(),
    "Generated by vite.config.js from TinySwords/Units.",
  );
}

async function generateUiCatalog() {
  await writeCatalogModule(
    uiCatalogFile,
    "UI_ASSETS",
    "UI_BY_KEY",
    await scanUi(),
    "Generated by vite.config.js from TinySwords/UI Elements.",
  );
}

async function generateAllCatalogs() {
  await generateTerrainTilesetCatalog();
  await generateBuildingCatalog();
  await generatePropCatalog();
  await generateUnitCatalog();
  await generateUiCatalog();
}

function isUnderDir(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Serves and copies repo-root TinySwords/ so Phaser URLs stay TinySwords/... */
function tinySwordsPublic() {
  return {
    name: "tinyswords-static",
    async buildStart() {
      await generateAllCatalogs();
    },
    async configureServer(server) {
      await generateAllCatalogs();
      const watchDirs = [
        terrainTilesetDir,
        buildingsDir,
        propsDecorationsDir,
        propsResourcesDir,
        propsParticleDir,
        unitsDir,
        uiElementsDir,
      ];
      for (const dir of watchDirs) {
        if (fs.existsSync(dir)) {
          server.watcher.add(dir);
        }
      }
      const onAssetTreeChange = async (file) => {
        const ext = path.extname(file).toLowerCase();
        if (!imageExts.has(ext)) {
          return;
        }
        await generateAllCatalogs();
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onAssetTreeChange);
      server.watcher.on("unlink", onAssetTreeChange);
      server.watcher.on("change", onAssetTreeChange);
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url?.split("?")[0] ?? "";
        if (!rawUrl.startsWith("/TinySwords/")) {
          return next();
        }
        let rel = decodeURIComponent(rawUrl.slice("/TinySwords/".length));
        rel = rel.replace(/^\/+/, "");
        const absRoot = path.resolve(tinySwordsDir);
        const absFile = path.resolve(absRoot, rel);
        const relSafe = path.relative(absRoot, absFile);
        if (relSafe.startsWith("..") || path.isAbsolute(relSafe)) {
          return next();
        }
        fs.stat(absFile, (err, st) => {
          if (err || !st.isFile()) {
            return next();
          }
          const ext = path.extname(absFile).toLowerCase();
          res.setHeader("Content-Type", mimeByExt[ext] ?? "application/octet-stream");
          fs.createReadStream(absFile).pipe(res);
        });
      });
    },
    async closeBundle() {
      const outDir = path.join(__dirname, "dist", "TinySwords");
      await cp(tinySwordsDir, outDir, {
        recursive: true,
        filter: (src) => {
          const ext = path.extname(src).toLowerCase();
          if (!ext) {
            return true;
          }
          if (!imageExts.has(ext)) {
            return false;
          }
          const base = path.basename(src).toLowerCase();
          const editorOnly = base.includes("template") || base.includes("source") || base.includes("preview");
          return !editorOnly;
        },
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [tinySwordsPublic()],
});
