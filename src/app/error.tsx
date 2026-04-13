"use client";

import { useEffect } from "react";
import { RevealText } from "@/components/motion";
import styles from "./error.module.scss";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[chork]", error);
  }, [error]);

  return (
    <div className={styles.page}>
      <RevealText text="Something went wrong" as="h2" className={styles.title} />
      <p className={styles.message}>
        An unexpected error occurred. Please try again.
      </p>
      <button onClick={reset} className={styles.retry}>
        Try again
      </button>
    </div>
  );
}
