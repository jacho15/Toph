import { setWorkerUrl } from "maplibre-gl";

// MapLibre's default worker URL is derived from `import.meta.url`, which Turbopack does
// not preserve, so the browser ended up requesting the page itself as a module script.
// Point MapLibre at the copy that scripts/copy-maplibre-worker.mjs places in public/.
// Import this module from every component that creates a map; module evaluation runs
// before the component body, so the URL is set before the first `new Map()`.
if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}
