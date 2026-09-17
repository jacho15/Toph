import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Static assets must never be auth-gated: a redirect to /login would hand an HTML page to a
  // request that expects an image, audio, or a script. `maplibre/` holds MapLibre's Web Worker
  // files (see lib/maplibre-worker.ts); a redirected worker script fails with a MIME error.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|maplibre/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mjs|js)$).*)",
  ],
};
