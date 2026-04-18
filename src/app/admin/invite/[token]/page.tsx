import { redirect } from "next/navigation";
import { createServiceClient, getServerUser } from "@/lib/supabase/server";
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
 *
 * Expiry is computed by the DB (`resolve_admin_invite` RPC, migration
 * 016). Comparing `expires_at` to `Date.now()` in the render path
 * trips Next.js 15's react-hooks/purity rule and would also drift
 * against the DB's clock — Postgres's `now()` is the only authority
 * that matters.
 */
export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;

  // Bounce signed-out users through login, preserving the invite URL.
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/admin/invite/${token}`);

  // Resolve the invite via the SECURITY DEFINER RPC so we read rows
  // addressed to a different email than the caller's, and so expiry
  // is computed in SQL rather than on the Node server.
  const service = createServiceClient();
  const { data: resolved } = await service
    .rpc("resolve_admin_invite", { p_token: token })
    .maybeSingle();

  if (!resolved) {
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

  const wrongEmail = callerEmail.toLowerCase() !== resolved.email.toLowerCase();

  const gym = await getGym(resolved.gym_id);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Admin invite</h1>
      <InviteAcceptCard
        token={token}
        gymName={gym?.name ?? "a gym"}
        role={resolved.role as "admin" | "owner"}
        email={resolved.email}
        signedInEmail={callerEmail}
        state={
          resolved.accepted ? "accepted"
          : resolved.expired ? "expired"
          : wrongEmail ? "wrong-email"
          : "ready"
        }
      />
    </main>
  );
}
