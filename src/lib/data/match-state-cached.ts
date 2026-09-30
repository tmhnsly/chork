import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getMatchStateForUser } from "./match-queries";
import type { MatchState } from "./match-types";

/**
 * Per-request dedupe for the heaviest read in the app — the whole
 * Match room bundle. The summary page asks twice per request
 * (`generateMetadata`, then the page body), and `getMatchStateForUser`
 * takes a supabase client argument, which defeats `React.cache()`
 * keying when each caller constructs its own. This wrapper keys on
 * the two strings and builds the service client inside — the same
 * split as `competition-by-id.ts`, and in its own module because
 * `match-queries` is client-reachable (JoinMatchForm) and must not
 * grow a `server-only` import chain.
 *
 * Layer 3 only: request-scoped, never shared across users — the
 * bundle is per-viewer by construction (participation gate, viewer-
 * resolved attempt mask).
 */
export const getMatchStateCached = cache(
  async (setId: string, userId: string): Promise<MatchState | null> =>
    getMatchStateForUser(createServiceClient(), setId, userId),
);
