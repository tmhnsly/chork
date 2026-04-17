import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { getJamState } from "@/lib/data/jam-queries";
import { getJamById } from "@/lib/data/jam-mutations";
import { JamScreen } from "@/components/Jam/JamScreen";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Jam - Chork",
};

export default async function JamRoomPage({ params }: Props) {
  const { id } = await params;
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  // Peek the jam row first to catch ended-jam navigations — the
  // summary page is the right destination for those, not the live
  // room. RLS now restricts `jams` SELECT to players + host only,
  // so a non-player hitting this URL sees null here and gets sent
  // to /jam/join to enter the code manually.
  const jam = await getJamById(auth.supabase, id);
  if (!jam) {
    // Either the jam doesn't exist (not found) or the caller isn't
    // a player. From the outside both look the same — send to the
    // join screen so they can enter the code.
    redirect("/jam/join");
  }
  if (jam.status === "ended") {
    // Summary id isn't on the jam row after end_jam; punt the
    // visitor back to /jam where the history strip surfaces it.
    redirect("/jam");
  }

  const initialState = await getJamState(auth.supabase, id);
  if (!initialState) {
    // Edge case — jam exists and we can read it but get_jam_state
    // refused (RLS on the state RPC fires `not a player`). Send
    // to the join flow to re-enter.
    redirect("/jam/join");
  }

  return <JamScreen initialState={initialState} userId={auth.userId} />;
}
