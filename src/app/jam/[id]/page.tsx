import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getJamStateForUser } from "@/lib/data/jam-queries";
import { joinJam } from "@/lib/data/jam-mutations";
import { JamScreen } from "@/components/Jam/JamScreen";
import { UUID_RE } from "@/lib/validation";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Jam - Chork",
};

export default async function JamRoomPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/jam/join");

  const auth = await requireSignedIn();
  // Preserve the destination so a QR-scan by an unauthenticated user
  // drops them back into the jam after they sign in. The login form
  // already honours `?next=` via `searchParams.get("next")`.
  if ("error" in auth) redirect(`/login?next=/jam/${id}`);

  // Hydrate via the service-role RPC, passing the user id explicitly.
  // The SSR auth context already resolved the user from cookies in
  // `requireSignedIn`; piping that id into the RPC avoids the older
  // flow's reliance on `auth.uid()` inside a SECURITY DEFINER body,
  // which would flake when the user's JWT was refreshed mid-request
  // and redirect legitimate players to /jam/join.
  //
  // Page-level auth IS the gate — the RPC is revoked from anon and
  // authenticated. Non-player user ids resolve to null. A null on the
  // first fetch could mean either "signed-in user hasn't joined yet"
  // (the QR-scan / direct-link case) or "jam ended / not found" — we
  // optimistically attempt a join and re-fetch; only if the second
  // fetch is still null do we bounce to `/jam/join`.
  const service = createServiceClient();
  let initialState = await getJamStateForUser(service, id, auth.userId);
  if (!initialState) {
    try {
      await joinJam(auth.supabase, id);
      initialState = await getJamStateForUser(service, id, auth.userId);
    } catch {
      // add_jam_player throws for ended / full / deleted jams — fall
      // through to the join screen, which doubles as the "this jam
      // isn't available" surface.
    }
    if (!initialState) {
      redirect("/jam/join");
    }
  }

  return <JamScreen initialState={initialState} userId={auth.userId} />;
}
