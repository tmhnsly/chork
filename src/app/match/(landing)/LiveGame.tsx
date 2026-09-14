import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getActiveMatchForUserById } from "@/lib/data/match-queries";
import { ActiveMatchBanner } from "@/components/Match/ActiveMatchBanner";

/**
 * The live-game banner, streamed. A route skeleton can't know whether
 * you have a game running, so it can't reserve this — the banner
 * arrives on its own (Reveal enters it, the sections beneath tween
 * down) rather than the page snapping to a different shape.
 */
export async function LiveGame() {
  const auth = await requireSignedIn();
  if ("error" in auth) return null;
  const match = await getActiveMatchForUserById(createServiceClient(), auth.userId);
  return match ? <ActiveMatchBanner match={match} /> : null;
}
