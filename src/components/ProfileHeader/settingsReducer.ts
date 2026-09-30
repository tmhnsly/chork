import {
  notifFlagsFromPrefs,
  pushPrefsSignature,
  defaultNotifFlags,
  type PushCategory,
  type PushPrefsSlice,
} from "@/lib/data/push-categories";
import type { PushStatus } from "@/lib/push/client";

/**
 * Local state model for the settings bottom-sheet. Modelled on
 * `routeLogReducer.ts` — discriminated-union actions, pure
 * transitions, immutable updates. Unit-tested independently of any
 * React render.
 *
 * Split rationale: the orchestrator used to own 11 sibling useState
 * fields — six sub-sheet open booleans (only one can meaningfully be
 * open at a time), two hand-rolled derive-from-props reconcilers
 * (notif flags + allow-invites, each mirroring a server profile value
 * into optimistic local state via render-time signature comparison),
 * and the push-subscription status. Centralising them makes the
 * "one active panel" invariant structural and the optimistic
 * flip + revert pairs testable.
 */

/** Sub-surface routing — exactly one (or none) open at a time. */
export type SettingsPanel =
  | "edit"
  | "delete"
  | "gym-switcher"
  | "install"
  | "theme"
  | "notifications";

export type NotifFlags = Record<PushCategory, boolean>;

/**
 * The slice of the auth profile the reducer reconciles against.
 * Structural subset of `Profile` so tests need no full fixture.
 */
export type SettingsProfileSlice = {
  allow_friend_requests: boolean;
} & PushPrefsSlice;

export interface SettingsState {
  activePanel: SettingsPanel | null;

  // ── Optimistic mirrors of server profile flags ──────
  // Seeded from the profile, flipped optimistically on tap, reverted
  // on server error, and reseeded whenever a profile refresh changes
  // the underlying value (keyed reconciliation — no useEffect).
  allowInvites: boolean;
  /** Last profile value seen for allow_friend_requests — reseed key. */
  lastProfileAllowInvites: boolean | null;

  notifFlags: NotifFlags;
  /** Signature of the last profile notif prefs seen — reseed key. */
  lastNotifSignature: string | null;

  /** null until the async readPushStatus() probe resolves. */
  pushStatus: PushStatus | null;
}

export type SettingsAction =
  // panel routing
  | { type: "open-panel"; panel: SettingsPanel }
  | { type: "close-panel" }
  // keyed reseed from a refreshed profile (render-time reconciliation)
  | { type: "reseed-from-profile"; profile: SettingsProfileSlice }
  // optimistic flip + revert — caller passes the explicit target value
  | { type: "set-allow-invites"; value: boolean }
  | { type: "set-notif-flag"; category: PushCategory; value: boolean }
  // push subscription lifecycle
  | { type: "set-push-status"; status: PushStatus | null };

// Signature of the profile's notification prefs — used to detect
// when a profile refresh should reseed the local optimistic flags
// without clobbering an unrelated in-flight toggle. Both the
// signature and the flag map derive from the category table's one
// home, so a new category reaches here with zero edits.
export function notifSignature(p: SettingsProfileSlice): string {
  return pushPrefsSignature(p);
}

function notifFlagsFromProfile(p: SettingsProfileSlice): NotifFlags {
  return notifFlagsFromPrefs(p);
}

/** Build the initial state from the profile that mounts the sheet. */
export function initialSettingsState(
  profile: SettingsProfileSlice | null,
): SettingsState {
  return {
    activePanel: null,
    allowInvites: profile?.allow_friend_requests ?? true,
    lastProfileAllowInvites: profile?.allow_friend_requests ?? null,
    notifFlags: profile ? notifFlagsFromPrefs(profile) : defaultNotifFlags(),
    lastNotifSignature: profile ? notifSignature(profile) : null,
    pushStatus: null,
  };
}

/**
 * True when a refreshed profile carries flag values the reducer
 * hasn't seen yet. The hook checks this during render and dispatches
 * `reseed-from-profile` (guarded, so no render loop) — the same
 * keyed-cache reconciliation the component previously hand-rolled
 * twice with setState-in-render.
 */
export function needsProfileReseed(
  state: SettingsState,
  profile: SettingsProfileSlice,
): boolean {
  return (
    notifSignature(profile) !== state.lastNotifSignature ||
    profile.allow_friend_requests !== state.lastProfileAllowInvites
  );
}

export function settingsReducer(
  state: SettingsState,
  action: SettingsAction,
): SettingsState {
  switch (action.type) {
    case "open-panel":
      return { ...state, activePanel: action.panel };

    case "close-panel":
      return { ...state, activePanel: null };

    case "reseed-from-profile": {
      const { profile } = action;
      let next = state;

      const sig = notifSignature(profile);
      if (sig !== state.lastNotifSignature) {
        next = {
          ...next,
          lastNotifSignature: sig,
          notifFlags: notifFlagsFromProfile(profile),
        };
      }
      if (profile.allow_friend_requests !== state.lastProfileAllowInvites) {
        next = {
          ...next,
          lastProfileAllowInvites: profile.allow_friend_requests,
          allowInvites: profile.allow_friend_requests,
        };
      }
      // Same-signature no-op returns the same reference so React can
      // bail out of the re-render.
      return next;
    }

    case "set-allow-invites":
      return { ...state, allowInvites: action.value };

    case "set-notif-flag":
      return {
        ...state,
        notifFlags: { ...state.notifFlags, [action.category]: action.value },
      };

    case "set-push-status":
      return { ...state, pushStatus: action.status };

    default: {
      // Exhaustiveness check — TS errors if a new action type is
      // added without a matching case.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
