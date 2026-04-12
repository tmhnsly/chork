"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, showToast } from "@/components/ui";
import { acceptAdminInvite } from "@/app/admin/actions";
import styles from "./inviteAcceptCard.module.scss";

interface Props {
  token: string;
  gymName: string;
  role: "admin" | "owner";
  email: string;
  signedInEmail: string;
  state: "ready" | "expired" | "wrong-email" | "accepted";
}

/**
 * Confirmation UI for a gym admin invite. Each state renders a
 * different message; only `ready` shows the accept button.
 */
export function InviteAcceptCard({
  token,
  gymName,
  role,
  email,
  signedInEmail,
  state,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      const res = await acceptAdminInvite(token);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Welcome to ${gymName}`, "success");
      router.push("/admin");
    });
  }

  if (state === "accepted") {
    return (
      <section className={styles.card}>
        <p className={styles.body}>This invite has already been used.</p>
      </section>
    );
  }

  if (state === "expired") {
    return (
      <section className={styles.card}>
        <p className={styles.body}>
          This invite has expired. Ask an existing admin to send a new one.
        </p>
      </section>
    );
  }

  if (state === "wrong-email") {
    return (
      <section className={styles.card}>
        <p className={styles.body}>
          This invite was sent to <strong>{email}</strong>, but you&apos;re
          signed in as <strong>{signedInEmail}</strong>. Sign out and try
          again with the invited email.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <p className={styles.body}>
        You&apos;ve been invited to join <strong>{gymName}</strong> as
        {" "}
        <strong>{role === "owner" ? "an owner" : "an admin"}</strong>.
      </p>
      <Button type="button" onClick={handleAccept} disabled={pending}>
        {pending ? "Accepting…" : "Accept invite"}
      </Button>
    </section>
  );
}
