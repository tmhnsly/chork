"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaQrcode, FaArrowRight } from "react-icons/fa6";
import { Banner, Button, showToast, Username } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useClientResource } from "@/hooks/use-client-resource";
import { lookupJamByCode } from "@/lib/data/jam-queries";
import { joinJamAction } from "@/app/jam/actions";
import type { JoinJamLookup } from "@/lib/data/jam-types";
import { JAM_CODE_RE } from "@/lib/validation";
import { JAM_SCALE_LABEL } from "./jam-scale-label";
import styles from "./joinJamForm.module.scss";

// BarcodeDetector isn't in lib.dom yet (Chromium / Safari ship it,
// Firefox + Edge don't). Declare the surface we use so the feature
// detection below + the constructor call below don't have to cast
// through `unknown` per usage.
interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface Props {
  initialCode: string | null;
}

export function JoinJamForm({ initialCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(initialCode ?? "");
  const [scanning, setScanning] = useState(false);

  const normalised = code.trim().toUpperCase();
  const codeValid = JAM_CODE_RE.test(normalised);

  // Auto-lookup on a valid code, keyed on the code itself: typing a
  // new code resets result + error structurally (key mismatch), so
  // no clear-on-change setState calls. The manual "Look up" button is
  // the hook's `reload` — it bumps the reload token and refetches the
  // current key (the old hand-rolled `retryTick`). The fetcher throws
  // the user-facing copy for the three known rejections so the hook's
  // error slot carries exactly the strings the Banner used to show.
  const { data: lookup, error, reload } = useClientResource<JoinJamLookup>(
    normalised,
    async (key) => {
      const supabase = createBrowserSupabase();
      const result = await lookupJamByCode(supabase, key);
      if (!result) throw new Error("No jam found for that code");
      if (result.status === "ended") {
        throw new Error("That jam has already ended");
      }
      if (result.at_cap) {
        throw new Error("That jam is full — 20 players is the max");
      }
      return result;
    },
    { enabled: codeValid },
  );
  const lookupError =
    error === null
      ? null
      : error instanceof Error
        ? error.message
        : "Couldn't look up that code";

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
            }}
          />
        </label>

        <div className={styles.codeActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={reload}
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

        {lookupError && <Banner variant="error">{lookupError}</Banner>}
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
                  <Username username={lookup.host_username} className={styles.mono} />
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
      const hasDetector = typeof window.BarcodeDetector !== "undefined";
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

        const Ctor = window.BarcodeDetector;
        if (!Ctor) return;
        const detector = new Ctor({ formats: ["qr_code"] });

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
