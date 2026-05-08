"use client";

import { useEffect, useRef } from "react";
import { FaCheck, FaXmark } from "react-icons/fa6";
import styles from "./routeLogSheet.module.scss";

/**
 * Inline edit form for a comment.
 *
 * We focus the input on mount and explicitly scroll it into view
 * afterwards. The `scrollIntoView` call mirrors what iOS does when
 * the user taps an input directly — the browser lifts the field
 * above the virtual keyboard. When focus is triggered *program-
 * matically* (our effect), iOS does not perform that lift, which
 * used to leave the edit input hidden behind the keyboard. A small
 * timeout gives the keyboard animation time to start so the scroll
 * position settles above it.
 *
 * The earlier "panel shifts up when editing" bug was fixed in CSS
 * by pinning the edit-form row height — that's why it's safe to
 * re-enable the natural scroll-into-view behaviour here.
 */
export function EditCommentForm({
  initialBody,
  onChange,
  onSubmit,
  onCancel,
}: {
  initialBody: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={styles.editForm}>
      <input
        ref={inputRef}
        type="text"
        className={styles.commentInput}
        value={initialBody}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={styles.editConfirm}
        onClick={onSubmit}
        disabled={!initialBody.trim()}
        aria-label="Save comment"
      >
        <FaCheck />
      </button>
      <button
        type="button"
        className={styles.editCancel}
        onClick={onCancel}
        aria-label="Cancel edit"
      >
        <FaXmark />
      </button>
    </div>
  );
}
