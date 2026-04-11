"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useAuth } from "@/lib/auth-context";
import { deleteAccount } from "@/lib/user-actions";
import { Button, showToast } from "@/components/ui";
import styles from "./deleteAccountDialog.module.scss";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONFIRMATION_WORD = "delete";

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const { signOut } = useAuth();
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmed = input.toLowerCase().trim() === CONFIRMATION_WORD;

  async function handleDelete() {
    if (!confirmed) return;
    setDeleting(true);
    try {
      const result = await deleteAccount();
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      showToast("Account deleted. We're sorry to see you go.");
      await signOut();
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Delete account</Dialog.Title>
          </VisuallyHidden.Root>

          <h2 className={styles.heading}>Sorry to see you go</h2>
          <p className={styles.body}>
            This will permanently delete your account and all your data — sends, comments,
            grades, everything. This cannot be undone.
          </p>
          <p className={styles.body}>
            If you are sure, type <strong>{CONFIRMATION_WORD}</strong> below to confirm.
          </p>

          <input
            type="text"
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Type "${CONFIRMATION_WORD}" to confirm`}
            autoComplete="off"
          />

          <div className={styles.actions}>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              fullWidth
            >
              {deleting ? "Deleting..." : "Delete my account"}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} fullWidth>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
