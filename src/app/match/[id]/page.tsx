import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMatchStateForUser, getUserSavedScales } from "@/lib/data/match-queries";
import { MatchScreen } from "@/components/Match/MatchScreen";
import { UUID_RE } from "@/lib/validation";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Game",
};

/**
 * Never serve this page from the client router cache. A live game
 * moves between visits — your own adds and sends, everyone else's —
 * and `staleTimes.dynamic` (60s, next.config.ts) handed a return
 * visit the payload from before them, so a route you'd just put up
 * was missing. The screen also resyncs when its realtime channel
 * joins (`channelStatusEvent`), which is what covers back/forward:
 * the browser history cache ignores this. Together: no stale paint on
 * a tab or banner, and a quick heal on the back button.
 */
export const unstable_dynamicStaleTime = 0;

export default async function MatchRoomPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/match/join");

  const auth = await requireSignedIn();
  // Preserve the destination so a QR-scan by an unauthenticated user
  // drops them back into the match after they sign in. The login form
  // already honours `?next=` via `searchParams.get("next")`.
  if ("error" in auth) redirect(`/login?next=/match/${id}`);

  // Hydrate via the service-role RPC, passing the user id explicitly.
  // The SSR auth context already resolved the user from cookies in
  // `requireSignedIn`; piping that id into the RPC avoids the older
  // flow's reliance on `auth.uid()` inside a SECURITY DEFINER body,
  // which would flake when the user's JWT was refreshed mid-request
  // and redirect legitimate players to /match/join.
  //
  // Page-level auth IS the gate — the RPC is revoked from anon and
  // authenticated. Non-player user ids resolve to null. A null on the
  // first fetch could mean either "signed-in user hasn't joined yet"
  // (the QR-scan / direct-link case) or "match ended / not found" — we
  // optimistically attempt a join and re-fetch; only if the second
  // fetch is still null do we bounce to `/match/join`.
  const service = createServiceClient();
  let initialState = await getMatchStateForUser(service, id, auth.userId);
  if (!initialState) {
    // join_match errors for ended / full / missing Matches — fall
    // through to the join screen, which doubles as the "this match
    // isn't available" surface.
    const { error: joinError } = await auth.supabase.rpc("join_match", {
      p_set_id: id,
    });
    if (!joinError) {
      initialState = await getMatchStateForUser(service, id, auth.userId);
    }
    if (!initialState) {
      redirect("/match/join");
    }
  }

  // An ended game has a result, not a board. Its players reach this
  // page again when a screen that missed the host ending it refreshes
  // (the live screen resyncs whenever the phone comes back), and the
  // live screen never looks at the status: every tap would fail.
  if (initialState.match.status === "archived") {
    redirect(`/match/summary/${id}`);
  }

  // The setup sheet's grading picker offers the host their saved custom
  // ladders. Nobody else can open it, so nobody else pays for the read.
  const savedScales =
    initialState.match.host_id === auth.userId ? await getUserSavedScales(auth.supabase) : [];

  return (
    <MatchScreen bundle={initialState} userId={auth.userId} savedScales={savedScales} />
  );
}
