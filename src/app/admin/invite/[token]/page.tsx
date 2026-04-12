import { redirect } from "next/navigation";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { InviteAcceptCard } from "@/components/admin/InviteAcceptCard";
import { getGym } from "@/lib/data/queries";
import styles from "./invite.module.scss";

export const metadata = {
  title: "Admin invite - Chork",
};

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Invite-acceptance landing page. Validates the token server-side (no
 * client guessing), resolves the target gym, and renders a confirm
 * card that posts to the accept server action. The actual admin-row
 * insert happens in `acceptAdminInvite()`; this page only decides
 * whether to offer the confirmation.
 */
export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;

  // Bounce signed-out users through login, preserving the invite URL.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/invite/${token}`);

  // Read the invite with the service role — the caller's JWT can't see
  // invites addressed to other emails, and we want to surface a useful
  // error if the email doesn't match rather than a blank 404.
  const service = createServiceClient();
  const { data: invite } = await service
    .from("gym_invites")
    .select("id, gym_id, email, role, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Invite not found</h1>
        <p className={styles.body}>
          The link may be expired or revoked. Ask the admin who invited
          you to send a new one.
        </p>
      </main>
    );
  }

  const { data: userRow } = await service.auth.admin.getUserById(user.id);
  const callerEmail = userRow?.user?.email ?? "";

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const wrongEmail = callerEmail.toLowerCase() !== invite.email.toLowerCase();
  const alreadyAccepted = !!invite.accepted_at;

  const gym = await getGym(service, invite.gym_id);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin invite</h1>
      <InviteAcceptCard
        token={token}
        gymName={gym?.name ?? "a gym"}
        role={invite.role as "admin" | "owner"}
        email={invite.email}
        signedInEmail={callerEmail}
        state={
          alreadyAccepted ? "accepted"
          : expired ? "expired"
          : wrongEmail ? "wrong-email"
          : "ready"
        }
      />
    </main>
  );
}
