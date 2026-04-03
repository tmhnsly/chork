"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[chork]", error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Something went wrong</h2>
      <p style={{ color: "var(--mono-text-low-contrast)", marginTop: "0.5rem" }}>
        {error.message.includes("429")
          ? "Too many requests — please wait a moment and try again."
          : "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: "1rem",
          padding: "0.75rem 1.5rem",
          background: "var(--accent-solid)",
          color: "var(--accent-on-solid)",
          border: "none",
          cursor: "pointer",
          minHeight: "44px",
        }}
      >
        Try again
      </button>
    </div>
  );
}
