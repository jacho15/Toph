import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses RLS entirely, so this is only for
 * server code that needs elevated access (e.g. the AI spend limiter's
 * SECURITY DEFINER RPCs, which are grant-restricted to `service_role`).
 * Never import this in client code — `server-only` will fail the build if
 * a client component tries to pull it in.
 */
export function createAdminClient() {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
