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
      {/*
        Two separate reveals so "Something went" / "wrong" break onto
        two lines regardless of viewport width — the headline's
        rhythm relies on the drop to the second line. Slight delay on
        the second reveal keeps the staggered arrival feel.
      */}
      <h2 className={styles.title}>
        <RevealText text="Something went" as="span" />
        <br />
        <RevealText text="wrong" as="span" delay={0.15} />
      </h2>
      <p className={styles.message}>
        An unexpected error occurred. Please try again.
      </p>
      <button onClick={reset} className={styles.retry}>
        Try again
      </button>
    </div>
  );
}
