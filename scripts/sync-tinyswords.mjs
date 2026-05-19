import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "dist", "TinySwords");
const dest = path.join(root, "TinySwords");

await cp(src, dest, { recursive: true, force: true });
console.log(`Synced ${src} -> ${dest}`);
