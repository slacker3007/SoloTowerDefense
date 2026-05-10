import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tinySwordsDir = path.join(__dirname, "TinySwords");

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

/** Serves and copies repo-root TinySwords/ so Phaser URLs stay TinySwords/... */
function tinySwordsPublic() {
  return {
    name: "tinyswords-static",
    configureServer(server) {
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
