"use client";

/**
 * Last-resort error boundary for crashes inside the root layout
 * itself (Providers, <html>, <body>, metadata). Next.js replaces
 * the entire document with this component, so it must render its
 * own <html> + <body>. Kept deliberately framework-free — no
 * theme providers, no font loading, no design tokens — because
 * whatever brought the layout down might be exactly one of those.
 *
 * Theming: the Radix tokens depend on the theme provider being
 * mounted, which is precisely the layer that might be broken here.
 * Instead, we define our own light + dark variables via a tiny
 * inline <style> + prefers-color-scheme media query. CLAUDE.md rule
 * "both light + dark must work — never override OS preference"
 * applies even to crash screens.
 *
 * `dangerouslySetInnerHTML` below is safe — content is a static
 * template string defined at module top with no user input.
 */

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

// Inline stylesheet — self-contained so it works even if every
// other style system is broken. Keep tiny.
const ERROR_STYLES = `
  :root {
    --err-bg: #f7f7f7;
    --err-fg: #111;
    --err-fg-muted: #555;
    --err-border: #d4d4d4;
    --err-btn-bg: #ffffff;
    --err-btn-hover: #efefef;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --err-bg: #0f0f0f;
      --err-fg: #f5f5f5;
      --err-fg-muted: #b3b3b3;
      --err-border: #333333;
      --err-btn-bg: #1a1a1a;
      --err-btn-hover: #262626;
    }
  }
  body.chork-error {
    margin: 0;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    background: var(--err-bg);
    color: var(--err-fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-align: center;
  }
  body.chork-error h1 { font-size: 1.5rem; font-weight: 600; margin: 0; }
  body.chork-error p { margin: 0; color: var(--err-fg-muted); max-width: 28rem; }
  body.chork-error .ref {
    font-size: 0.75rem;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
  body.chork-error button {
    appearance: none;
    border: 1px solid var(--err-border);
    background: var(--err-btn-bg);
    color: var(--err-fg);
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
  }
  body.chork-error button:hover { background: var(--err-btn-hover); }
`;

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[chork:global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: ERROR_STYLES }} />
      </head>
      <body className="chork-error">
        <h1>Something went wrong</h1>
        <p>
          Chork ran into an unexpected error. Try again — if this keeps
          happening, refresh the page.
        </p>
        {error.digest ? <p className="ref">ref: {error.digest}</p> : null}
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
