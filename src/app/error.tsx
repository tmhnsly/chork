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
    // Prod: digest-only. Next already redacts `error.message` to a
    // generic string in production, so the full Error object carries
    // no real server-side context for the client; the digest is the
    // correlation key for the server log entry. Dropping the object
    // also keeps any attached client telemetry (Sentry/etc) from
    // shipping stack frames that were meant to stay server-side.
    //
    // Dev: keep the full Error. `pnpm dev` debugging is a lot worse
    // without a stack, and the prod redaction concern doesn't apply.
    if (process.env.NODE_ENV === "development") {
      console.error("[chork] page error", error);
    } else {
      console.error("[chork] page error", { digest: error.digest });
    }
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
