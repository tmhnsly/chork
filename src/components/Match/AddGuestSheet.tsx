"use client";

import { useState } from "react";
import { FaUserPlus } from "react-icons/fa6";
import { BottomSheet, Button, SheetBody } from "@/components/ui";
import styles from "./addGuestSheet.module.scss";

interface Props {
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}

const MAX_NAME = 40;

/**
 * Seat a guest — someone climbing with you who hasn't got the app.
 *
 * A name is all it takes, which is the point: joining is the thirty
 * seconds in which one climber recruits another, and install → sign
 * up → code doesn't fit in thirty seconds. The host enters their
 * sends, so a guest needs no account and no session.
 */
export function AddGuestSheet({ onClose, onSubmit, pending }: Props) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <BottomSheet open onClose={onClose} title="Add a guest">
      <SheetBody>
        <label className={styles.field}>
          <span className={styles.label}>Their name</span>
          <input
            type="text"
            className={styles.input}
            value={name}
            maxLength={MAX_NAME}
            placeholder="e.g. Dave"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !pending) onSubmit(trimmed);
            }}
          />
          <span className={styles.hint}>
            They&apos;ll climb on the same routes and appear on the board.
            You log their sends — they don&apos;t need the app.
          </span>
        </label>

        <Button
          type="button"
          onClick={() => onSubmit(trimmed)}
          disabled={!trimmed || pending}
          fullWidth
        >
          <FaUserPlus aria-hidden /> Add to match
        </Button>
      </SheetBody>
    </BottomSheet>
  );
}
