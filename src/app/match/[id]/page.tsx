import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMatchStateForUser } from "@/lib/data/match-queries";
import { MatchScreen } from "@/components/Match/MatchScreen";
import { UUID_RE } from "@/lib/validation";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Match - Chork",
};

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

  return <MatchScreen initialState={initialState} userId={auth.userId} />;
}
