"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, showToast } from "@/components/ui";
import { createCrew } from "@/app/crew/actions";
import styles from "./createCrewSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful create so the parent can focus the new crew. */
  onCreated: (crewId: string) => void;
}

export function CreateCrewSheet({ open, onClose, onCreated }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createCrew(name);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Created ${name.trim()}`, "success");
      setName("");
      onCreated(res.crewId);
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="New crew"
      description="Name the crew you're starting"
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <h2 className={styles.heading}>New crew</h2>
        <label className={styles.field}>
          <span className={styles.label}>Crew name</span>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            placeholder="e.g. Tuesday Night Crew"
          />
        </label>
        <Button type="submit" disabled={pending || !name.trim()} fullWidth>
          {pending ? "Creating…" : "Create crew"}
        </Button>
      </form>
    </BottomSheet>
  );
}
