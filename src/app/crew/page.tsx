import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import {
  getMyCrews,
  getPendingCrewInvites,
  getCrewMembers,
  type CrewMember,
} from "@/lib/data/crew-queries";
import { CrewPicker } from "@/components/Crew/CrewPicker";
import { PageHeader } from "@/components/motion";
import styles from "./crew.module.scss";

export const metadata = {
  title: "Crew - Chork",
};

export default async function CrewPage() {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");
  const { supabase, userId } = auth;

  const [myCrews, invites] = await Promise.all([
    getMyCrews(supabase, userId),
    getPendingCrewInvites(supabase, userId),
  ]);

  // Member previews for the avatar stack on each crew card — up to 4
  // per crew. N small queries is acceptable here: `getCrewMembers`
  // is RLS-gated and only the caller's crews are fetched (typically
  // < 10), so total round-trips stay bounded. A batched RPC would
  // tighten this if we ever see users in dozens of crews.
  const previewEntries = await Promise.all(
    myCrews.map(async (crew) => {
      const members = await getCrewMembers(supabase, crew.id);
      return [crew.id, members.slice(0, 4)] as const;
    }),
  );
  const previews = Object.fromEntries(previewEntries) as Record<
    string,
    Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[]
  >;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Crew"
        subtitle="Your climbing group, your private leaderboard."
      />
      <CrewPicker myCrews={myCrews} invites={invites} previews={previews} />
    </main>
  );
}
