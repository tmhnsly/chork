import { redirect } from "next/navigation";
import { requireGymAdmin } from "@/lib/auth";
import styles from "./layout.module.scss";

/**
 * Admin route group. Gates every page underneath with a server-side
 * `is_gym_admin` check — non-admins get bounced to the wall page
 * before any admin markup is sent to the client. RLS provides the
 * second layer: even if this layout were bypassed, every query under
 * the admin UI runs under the caller's JWT and is bound by the
 * policies shipped in migration 014.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireGymAdmin();
  if ("error" in auth) {
    // Non-admin or no admin gym assigned yet. Surface a dedicated signup
    // flow in Phase 2 — for now, bounce to the climber home.
    redirect("/");
  }

  return <div className={styles.shell}>{children}</div>;
}
