"use client";

import { useEffect, useReducer } from "react";
import type { Profile } from "@/lib/data/types";
import { savePushSubscription, removePushSubscription } from "@/app/(app)/push-actions";
import { setAllowCrewInvites } from "@/app/crew/actions";
import { updatePushCategory, type PushCategoryKey } from "@/lib/user-actions";
import {
  isStandalonePwa,
  pushSupported,
  readPushStatus,
  subscribeDevice,
  unsubscribeDevice,
} from "@/lib/push/client";
import { showToast } from "@/components/ui";
import {
  initialSettingsState,
  needsProfileReseed,
  settingsReducer,
  type SettingsPanel,
  type SettingsState,
} from "./settingsReducer";

export interface UseSettingsState {
  state: SettingsState;
  /** Derived flag — whether the push on/off row should render. */
  pushMenuVisible: boolean;
  /** UI event handlers — pass straight through to the JSX. */
  openPanel: (panel: SettingsPanel) => void;
  closePanel: () => void;
  handleToggleAllowInvites: () => Promise<void>;
  handleTogglePush: () => Promise<void>;
  handleToggleNotif: (category: PushCategoryKey) => Promise<void>;
}

/**
 * State + handlers for the settings bottom-sheet. Pairs the pure
 * `settingsReducer` with the async push-status probe and the three
 * optimistic-toggle server round-trips (allow-invites, push
 * subscription, per-category notif flags).
 *
 * The orchestrator (`SettingsSheet.tsx`) is purely the JSX tree plus
 * theme/sign-out bridging — every piece of local state + every async
 * side effect lives here.
 */
export function useSettingsState(profile: Profile | null): UseSettingsState {
  const [state, dispatch] = useReducer(
    settingsReducer,
    profile,
    initialSettingsState,
  );

  // ── Keyed reseed from profile (render-time reconciliation) ──
  // When a background profile refresh lands with different flag
  // values, reseed the optimistic mirrors. Guarded dispatch during
  // render — the reducer records the new signature, so this fires at
  // most once per profile change (no effect, no extra paint of stale
  // flags).
  if (profile && needsProfileReseed(state, profile)) {
    dispatch({ type: "reseed-from-profile", profile });
  }

  // ── Push status probe (async browser API — effect required) ──
  useEffect(() => {
    let cancelled = false;
    readPushStatus().then((s) => {
      if (!cancelled) dispatch({ type: "set-push-status", status: s });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pushMenuVisible =
    pushSupported() &&
    state.pushStatus !== null &&
    state.pushStatus !== "unsupported" &&
    state.pushStatus !== "denied";

  // ── Handlers ────────────────────────────────────────
  function openPanel(panel: SettingsPanel) {
    dispatch({ type: "open-panel", panel });
  }

  function closePanel() {
    dispatch({ type: "close-panel" });
  }

  async function handleToggleAllowInvites() {
    const next = !state.allowInvites;
    dispatch({ type: "set-allow-invites", value: next });
    const res = await setAllowCrewInvites(next);
    if ("error" in res) {
      dispatch({ type: "set-allow-invites", value: !next });
      showToast(res.error, "error");
      return;
    }
    showToast(next ? "Crew invites on" : "Crew invites off", "info");
  }

  async function handleTogglePush() {
    if (state.pushStatus !== "subscribed" && !isStandalonePwa()) {
      dispatch({ type: "open-panel", panel: "install" });
      return;
    }
    if (state.pushStatus === "subscribed") {
      const { endpoint } = await unsubscribeDevice();
      if (endpoint) {
        const res = await removePushSubscription(endpoint);
        if ("error" in res) {
          showToast(res.error, "error");
          return;
        }
      }
      dispatch({ type: "set-push-status", status: "granted" });
      showToast("Notifications off", "info");
      return;
    }

    const result = await subscribeDevice();
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    const res = await savePushSubscription(result);
    if ("error" in res) {
      showToast(res.error, "error");
      return;
    }
    dispatch({ type: "set-push-status", status: "subscribed" });
    showToast("Notifications on", "success");
  }

  async function handleToggleNotif(category: PushCategoryKey) {
    const next = !state.notifFlags[category];
    dispatch({ type: "set-notif-flag", category, value: next });
    const res = await updatePushCategory(category, next);
    if ("error" in res) {
      dispatch({ type: "set-notif-flag", category, value: !next });
      showToast(res.error, "error");
    }
  }

  return {
    state,
    pushMenuVisible,
    openPanel,
    closePanel,
    handleToggleAllowInvites,
    handleTogglePush,
    handleToggleNotif,
  };
}
