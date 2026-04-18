"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { SheetActions } from "./SheetActions";
import styles from "./sheetPrimitives.module.scss";

interface Props {
  /**
   * Confirmation copy. ReactNode so consumers can pass a `<p>` with
   * inline formatting (strong for emphasised values, nested spans
   * etc.) rather than being limited to a plain string.
   */
  prompt: ReactNode;
  /** Label on the commit button — "End jam", "Delete", "Sign out", … */
  confirmLabel: string;
  /** Label on the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Whilst `true`, disables both buttons and shows the pendingLabel. */
  pending?: boolean;
  pendingLabel?: string;
  /**
   * Visual weight of the confirm button. "danger" for destructive
   * ops (end jam, delete account, sign out); "primary" for neutral
   * commits (transfer ownership, publish set).
   */
  confirmVariant?: "danger" | "primary";
}

/**
 * Inline confirmation pattern — renders as a prompt paragraph + a
 * two-button row. Used inside sheets and dialogs whenever the user
 * has triggered a destructive or high-stakes action and needs to
 * explicitly opt in before it fires.
 *
 * Canonical examples: "End this jam for everyone?", "Delete your
 * account and all data?", "Transfer crew ownership?".
 *
 * Pair with `<BottomSheet>` or `<AppDialog>` as the containing
 * surface; `<ConfirmInline>` only draws the inner confirm row.
 */
export function ConfirmInline({
  prompt,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  pending = false,
  pendingLabel,
  confirmVariant = "danger",
}: Props) {
  return (
    <section className={styles.confirm}>
      <div className={styles.confirmPrompt}>{prompt}</div>
      <SheetActions>
        <Button
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={pending}
          fullWidth
        >
          {pending ? pendingLabel ?? `${confirmLabel}…` : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
          fullWidth
        >
          {cancelLabel}
        </Button>
      </SheetActions>
    </section>
  );
}
