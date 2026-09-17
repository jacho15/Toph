// Copies MapLibre's Web Worker (and the shared chunk it imports) into public/ so the
// browser can load it from a real URL.
//
// Why this exists: maplibre-gl 6 locates its worker with
// `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Inside a Turbopack bundle
// `import.meta.url` is not the file's real location, so the browser requested the page
// URL, received HTML, and refused it as a module script. Without the worker MapLibre
// cannot process GeoJSON sources, so field outlines never rendered while raster tiles
// (decoded on the main thread) looked fine. `lib/maplibre-worker.ts` points MapLibre at
// the copies made here.
//
// Runs on `postinstall` (so a fresh checkout and the Vercel build both get the files)
// and on `prebuild`. The output directory is gitignored: it is vendor code that must
// match the installed maplibre-gl version, not something to hand-edit.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "maplibre");

mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(source, file), join(target, file));
}
console.log(`copied maplibre worker files to ${target}`);
