import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getJamStateForUser } from "@/lib/data/jam-queries";
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
  if ("error" in auth) redirect("/login");

  // Hydrate via the service-role RPC, passing the user id explicitly.
  // The SSR auth context already resolved the user from cookies in
  // `requireSignedIn`; piping that id into the RPC avoids the older
  // flow's reliance on `auth.uid()` inside a SECURITY DEFINER body,
  // which would flake when the user's JWT was refreshed mid-request
  // and redirect legitimate players to /jam/join.
  //
  // Page-level auth IS the gate — the RPC is revoked from anon and
  // authenticated. Non-player user ids resolve to null and we send
  // the visitor to the join screen (which doubles as the "jam not
  // found / already ended" fallback, since `end_jam` deletes the
  // row and this RPC then returns null identically).
  const service = createServiceClient();
  const initialState = await getJamStateForUser(service, id, auth.userId);
  if (!initialState) {
    redirect("/jam/join");
  }

  return <JamScreen initialState={initialState} userId={auth.userId} />;
}
