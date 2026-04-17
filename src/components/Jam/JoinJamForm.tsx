"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaQrcode, FaArrowRight } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { lookupJamByCode } from "@/lib/data/jam-queries";
import { joinJamAction } from "@/app/jam/actions";
import type { JoinJamLookup } from "@/lib/data/jam-types";
import styles from "./joinJamForm.module.scss";

interface Props {
  initialCode: string | null;
}

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function JoinJamForm({ initialCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(initialCode ?? "");
  const [lookup, setLookup] = useState<JoinJamLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const normalised = code.trim().toUpperCase();
  const codeValid = CODE_PATTERN.test(normalised);

  // Auto-lookup whenever the input resolves to a valid code that
  // hasn't already produced a result or error. Work runs inside an
  // async IIFE so React's setState calls happen post-await, and a
  // `cancelled` flag guards against stale writes when the user types
  // ahead of the previous lookup landing.
  useEffect(() => {
    if (!codeValid) return;
    if (lookup) return;
    if (lookupError) return;
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
  }, [codeValid, normalised, lookup, lookupError]);

  // Manual "Look up" button — clears any prior result/error and
  // forces the auto-lookup effect above to re-fire.
  function triggerLookup() {
    setLookupError(null);
    setLookup(null);
  }

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
              <dd>
                {lookup.grading_scale === "v"
                  ? "V-scale"
                  : lookup.grading_scale === "font"
                  ? "Font"
                  : "Custom"}
              </dd>
            </div>
          </dl>
          <Button type="button" onClick={handleJoin} disabled={pending} fullWidth>
            {pending ? "Joining…" : "Join jam"}{" "}
            <FaArrowRight aria-hidden style={{ marginLeft: "auto" }} />
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
