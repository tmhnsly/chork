"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { deleteAccount } from "@/lib/user-actions";
import { AppDialog, Button, SheetActions, showToast } from "@/components/ui";
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
      showToast("Account deleted");
      await signOut();
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Delete account" description="Permanently delete your account and all associated data">
      <h2 className={styles.heading}>We get it, no hard feelings</h2>
      <p className={styles.body}>
        Just so you know, this will wipe everything - your sends, comments, grades,
        all of it. Once it is gone, it is gone for good.
      </p>
      <p className={styles.body}>
        If you are sure, type <strong>{CONFIRMATION_WORD}</strong> below and we will sort it out.
      </p>

      <input
        type="text"
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`Type "${CONFIRMATION_WORD}" to confirm`}
        aria-label={`Type "${CONFIRMATION_WORD}" to confirm account deletion`}
        autoComplete="off"
      />

      <SheetActions>
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
      </SheetActions>
    </AppDialog>
  );
}
