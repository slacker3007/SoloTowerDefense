import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tinySwordsDir = path.join(__dirname, "TinySwords");
const terrainTilesetDir = path.join(tinySwordsDir, "Terrain", "Tileset");
const terrainTilesetCatalogFile = path.join(__dirname, "src", "game", "generated", "terrainTilesetCatalog.js");
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

/** Serves and copies repo-root TinySwords/ so Phaser URLs stay TinySwords/... */
function tinySwordsPublic() {
  return {
    name: "tinyswords-static",
    async buildStart() {
      await generateTerrainTilesetCatalog();
    },
    async configureServer(server) {
      await generateTerrainTilesetCatalog();
      server.watcher.add(terrainTilesetDir);
      server.watcher.on("add", async (file) => {
        if (path.dirname(file) === terrainTilesetDir && imageExts.has(path.extname(file).toLowerCase())) {
          await generateTerrainTilesetCatalog();
          server.ws.send({ type: "full-reload" });
        }
      });
      server.watcher.on("unlink", async (file) => {
        if (path.dirname(file) === terrainTilesetDir && imageExts.has(path.extname(file).toLowerCase())) {
          await generateTerrainTilesetCatalog();
          server.ws.send({ type: "full-reload" });
        }
      });
      server.watcher.on("change", async (file) => {
        if (path.dirname(file) === terrainTilesetDir && imageExts.has(path.extname(file).toLowerCase())) {
          await generateTerrainTilesetCatalog();
          server.ws.send({ type: "full-reload" });
        }
      });
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
      await cp(tinySwordsDir, outDir, { recursive: true });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [tinySwordsPublic()],
});
