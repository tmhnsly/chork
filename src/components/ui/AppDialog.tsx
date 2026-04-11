"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import styles from "./appDialog.module.scss";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title (always rendered, visually hidden by default) */
  title: string;
  /** Accessible description — provides context beyond the title for screen readers */
  description?: string;
  children: ReactNode;
}

/**
 * Reusable centred dialog with overlay, shadow, and animation.
 * Renders children inside a styled content panel.
 * Use for: edit profile, delete account, confirmations, etc.
 */
export function AppDialog({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{title}</Dialog.Title>
          </VisuallyHidden.Root>
          <VisuallyHidden.Root asChild>
            <Dialog.Description>{description ?? title}</Dialog.Description>
          </VisuallyHidden.Root>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
