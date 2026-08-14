"use client";

import { useState, useTransition } from "react";
import { FaShareNodes, FaCheck } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { shareResultAction } from "@/app/jam/actions";

interface Props {
  summaryId: string;
  /** Match name, used in the share sheet's title. */
  label: string;
}

/**
 * Turns a finished result into something pasteable.
 *
 * This is the growth loop: climbers already have a group chat, and
 * the cheapest way into it is to hand them a link worth sending
 * rather than build a feed to compete with it.
 *
 * Two paths, because the Web Share API is mobile-first and this is a
 * PWA:
 *   • `navigator.share` where available — opens the native sheet, so
 *     one tap reaches WhatsApp with the unfurl.
 *   • clipboard otherwise, with the button confirming in place. No
 *     toast for the copy path; the label change IS the feedback and
 *     a toast on top reads as noise.
 *
 * The link is minted on demand rather than at end-of-match, so a
 * result nobody shares never becomes reachable at all.
 */
export function ShareResultButton({ summaryId, label }: Props) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleShare() {
    startTransition(async () => {
      const res = await shareResultAction(summaryId);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }

      const shareData = {
        title: `${label} — Chork`,
        text: "Here's how it went:",
        url: res.url,
      };

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (err) {
          // AbortError = the user dismissed the sheet. That's a
          // choice, not a failure — fall through to nothing rather
          // than shouting at them, and only fall back to copying on
          // a real error.
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      try {
        await navigator.clipboard.writeText(res.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        showToast("Couldn't copy the link", "error");
      }
    });
  }

  return (
    <Button onClick={handleShare} loading={pending} fullWidth>
      {copied ? (
        <>
          <FaCheck aria-hidden /> Link copied
        </>
      ) : (
        <>
          <FaShareNodes aria-hidden /> Share result
        </>
      )}
    </Button>
  );
}
