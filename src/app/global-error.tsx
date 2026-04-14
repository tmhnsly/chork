"use client";

/**
 * Last-resort error boundary for crashes inside the root layout
 * itself (Providers, <html>, <body>, metadata). Next.js replaces
 * the entire document with this component, so it must render its
 * own <html> + <body>. Kept deliberately framework-free — no
 * theme providers, no font loading, no design tokens — because
 * whatever brought the layout down might be exactly one of those.
 */

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[chork:global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          background: "#0f0f0f",
          color: "#f5f5f5",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, opacity: 0.75, maxWidth: "28rem" }}>
          Chork ran into an unexpected error. Try again — if this keeps
          happening, refresh the page.
        </p>
        {error.digest ? (
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              opacity: 0.5,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}
          >
            ref: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            appearance: "none",
            border: "1px solid #333",
            background: "#1a1a1a",
            color: "#f5f5f5",
            padding: "0.75rem 1.25rem",
            borderRadius: "0.5rem",
            fontSize: "1rem",
            cursor: "pointer",
            minHeight: 44,
            minWidth: 44,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
