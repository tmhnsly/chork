"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaQrcode, FaArrowRight } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { lookupJamByCode } from "@/lib/data/jam-queries";
import { joinJamAction } from "@/app/jam/actions";
import type { JoinJamLookup } from "@/lib/data/jam-types";
import { JAM_CODE_RE } from "@/lib/validation";
import { JAM_SCALE_LABEL } from "./jam-scale-label";
import styles from "./joinJamForm.module.scss";

interface Props {
  initialCode: string | null;
}

export function JoinJamForm({ initialCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(initialCode ?? "");
  const [lookup, setLookup] = useState<JoinJamLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const normalised = code.trim().toUpperCase();
  const codeValid = JAM_CODE_RE.test(normalised);

  // Retry counter: the manual "Look up" button bumps this to
  // re-run the auto-lookup effect without depending on the lookup
  // result state. Previously the effect had `lookup` + `lookupError`
  // in its deps so the button could flip those back to null and
  // re-trigger — that caused the effect to re-subscribe on every
  // settle. With a dedicated retry tick, the effect only re-runs
  // when the user intentionally asks for it or the code changes.
  const [retryTick, setRetryTick] = useState(0);

  // Auto-lookup on a valid code or manual retry. The async IIFE
  // pattern keeps the setState calls on a post-await microtask,
  // which the project's `react-hooks/set-state-in-effect` rule
  // tolerates as long as the effect body itself doesn't call
  // setState synchronously.
  useEffect(() => {
    if (!codeValid) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const result = await lookupJamByCode(supabase, normalised);
      if (cancelled) return;
      if (!result) {
        setLookupError("No jam found for that code");
        return;
      }
      if (result.status === "ended") {
        setLookupError("That jam has already ended");
        return;
      }
      if (result.at_cap) {
        setLookupError("That jam is full — 20 players is the max");
        return;
      }
      setLookup(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [codeValid, normalised, retryTick]);

  // Manual "Look up" — clear prior result/error and bump the retry
  // tick so the auto-lookup effect re-fires for the current code.
  const triggerLookup = useCallback(() => {
    setLookupError(null);
    setLookup(null);
    setRetryTick((t) => t + 1);
  }, []);

  function handleJoin() {
    if (!lookup) return;
    startTransition(async () => {
      const result = await joinJamAction(lookup.jam_id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/jam/${lookup.jam_id}`);
    });
  }

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <label className={styles.field}>
          <span className={styles.label}>Join code</span>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            className={styles.codeInput}
            value={normalised}
            placeholder="ABC123"
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""));
              setLookup(null);
              setLookupError(null);
            }}
          />
        </label>

        <div className={styles.codeActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={triggerLookup}
            disabled={!codeValid || pending}
          >
            Look up
          </Button>
          <QrScannerButton
            scanning={scanning}
            setScanning={setScanning}
            onCode={(scanned) => {
              setCode(scanned.toUpperCase());
              setScanning(false);
            }}
          />
        </div>

        {lookupError && <p className={styles.error}>{lookupError}</p>}
      </section>

      {lookup && (
        <section className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <span className={styles.eyebrow}>Join jam</span>
            <h2 className={styles.previewTitle}>
              {lookup.name?.trim() || "Untitled jam"}
            </h2>
            {lookup.location && (
              <p className={styles.previewMeta}>{lookup.location}</p>
            )}
          </div>
          <dl className={styles.previewGrid}>
            <div className={styles.previewRow}>
              <dt>Host</dt>
              <dd>
                {lookup.host_display_name || "Unknown"}{" "}
                {lookup.host_username && (
                  <span className={styles.mono}>@{lookup.host_username}</span>
                )}
              </dd>
            </div>
            <div className={styles.previewRow}>
              <dt>Players</dt>
              <dd>
                {lookup.player_count} / 20
              </dd>
            </div>
            <div className={styles.previewRow}>
              <dt>Scale</dt>
              <dd>{JAM_SCALE_LABEL[lookup.grading_scale]}</dd>
            </div>
          </dl>
          <Button type="button" onClick={handleJoin} disabled={pending} fullWidth>
            {pending ? "Joining…" : "Join jam"}{" "}
            <span className={styles.ctaIcon}>
              <FaArrowRight aria-hidden />
            </span>
          </Button>
        </section>
      )}
    </div>
  );
}

/**
 * QR scanner button. Gated on BarcodeDetector support — the button
 * simply doesn't render on browsers that can't scan (climbers fall
 * back to pasting / typing the 6-char code). Keeps the flow honest
 * instead of showing a "not supported" modal.
 */
function QrScannerButton({
  scanning,
  setScanning,
  onCode,
}: {
  scanning: boolean;
  setScanning: (v: boolean) => void;
  onCode: (code: string) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") {
        return;
      }
      const hasDetector =
        typeof (window as unknown as { BarcodeDetector?: unknown })
          .BarcodeDetector !== "undefined";
      const hasCamera = !!navigator.mediaDevices?.getUserMedia;
      if (!cancelled) setSupported(hasDetector && hasCamera);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector: new (options: { formats: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

        intervalId = window.setInterval(async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) {
              const raw = results[0].rawValue;
              // Accept either a bare 6-char code or a URL ending in
              // ?code=XXXXXX — covers hand-rolled QRs either way.
              const match = raw.match(/([A-HJ-NP-Z2-9]{6})/i);
              if (match) {
                onCode(match[1].toUpperCase());
              }
            }
          } catch {
            // Per-frame detector errors are noisy but recoverable; skip.
          }
        }, 400);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Camera access blocked",
          "error",
        );
        setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, onCode, setScanning]);

  if (supported === false) return null;
  if (supported === null) {
    return (
      <Button type="button" variant="secondary" disabled>
        <FaQrcode aria-hidden /> Scan QR
      </Button>
    );
  }

  if (!scanning) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setScanning(true)}
      >
        <FaQrcode aria-hidden /> Scan QR
      </Button>
    );
  }

  return (
    <div className={styles.scannerFrame}>
      <video ref={videoRef} playsInline muted className={styles.scannerVideo} />
      <Button type="button" variant="secondary" onClick={() => setScanning(false)}>
        Stop scanning
      </Button>
    </div>
  );
}
