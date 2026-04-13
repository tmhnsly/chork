"use client";

import { useMemo } from "react";
import { FaApple, FaAndroid, FaArrowUpFromBracket, FaEllipsisVertical, FaPlus } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import styles from "./installPwaSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports as Mac — sniff touch points to disambiguate.
  const isIpadOS =
    ua.includes("mac") &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  if (isIpadOS || /iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

/**
 * Explains how to add Chork to the home screen so push notifications
 * can work. Opened from the Settings menu when the user taps "Get
 * notifications" while the site is running in a regular browser tab
 * — web push only fires reliably from an installed PWA on iOS, so
 * gating behind install gives the best outcome across platforms.
 */
export function InstallPwaSheet({ open, onClose }: Props) {
  const platform = useMemo(() => detectPlatform(), []);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Install Chork"
      description="Add Chork to your home screen to turn on notifications"
    >
      <div className={styles.sheet}>
        <p className={styles.lede}>
          Notifications run through an installed app. Add Chork to your
          home screen and open it from there to turn them on.
        </p>

        {platform !== "android" && (
          <section className={styles.section} aria-labelledby="ios-heading">
            <h3 id="ios-heading" className={styles.sectionHeading}>
              <FaApple aria-hidden /> iPhone / iPad (Safari)
            </h3>
            <ol className={styles.steps}>
              <li>
                Tap the <strong>Share</strong> icon{" "}
                <FaArrowUpFromBracket className={styles.inlineIcon} aria-hidden />{" "}
                at the bottom of the screen.
              </li>
              <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>. Open Chork from the home screen to enable notifications.</li>
            </ol>
          </section>
        )}

        {platform !== "ios" && (
          <section className={styles.section} aria-labelledby="android-heading">
            <h3 id="android-heading" className={styles.sectionHeading}>
              <FaAndroid aria-hidden /> Android (Chrome)
            </h3>
            <ol className={styles.steps}>
              <li>
                Tap the <strong>menu</strong>{" "}
                <FaEllipsisVertical className={styles.inlineIcon} aria-hidden />{" "}
                in the top-right.
              </li>
              <li>
                Choose <strong>Install app</strong>{" "}
                <FaPlus className={styles.inlineIcon} aria-hidden /> (or
                "Add to home screen").
              </li>
              <li>Open Chork from your home screen to enable notifications.</li>
            </ol>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}
