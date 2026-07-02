import { describe, expect, it } from "vitest";
import {
  initialSettingsState,
  needsProfileReseed,
  notifSignature,
  settingsReducer,
  type SettingsProfileSlice,
  type SettingsState,
} from "./settingsReducer";

function mkProfile(
  overrides: Partial<SettingsProfileSlice> = {},
): SettingsProfileSlice {
  return {
    allow_crew_invites: true,
    push_invite_received: true,
    push_invite_accepted: true,
    push_ownership_changed: true,
    ...overrides,
  };
}

describe("initialSettingsState", () => {
  it("seeds flags from the profile", () => {
    const profile = mkProfile({
      allow_crew_invites: false,
      push_invite_accepted: false,
    });
    const state = initialSettingsState(profile);
    expect(state.allowInvites).toBe(false);
    expect(state.lastProfileAllowInvites).toBe(false);
    expect(state.notifFlags).toEqual({
      invite_received: true,
      invite_accepted: false,
      ownership_changed: true,
    });
    expect(state.lastNotifSignature).toBe(notifSignature(profile));
    expect(state.activePanel).toBeNull();
    expect(state.pushStatus).toBeNull();
  });

  it("defaults every flag to true with no profile", () => {
    const state = initialSettingsState(null);
    expect(state.allowInvites).toBe(true);
    expect(state.lastProfileAllowInvites).toBeNull();
    expect(state.notifFlags).toEqual({
      invite_received: true,
      invite_accepted: true,
      ownership_changed: true,
    });
    expect(state.lastNotifSignature).toBeNull();
  });
});

describe("panel routing", () => {
  const base = initialSettingsState(mkProfile());

  it("opens a panel", () => {
    const next = settingsReducer(base, { type: "open-panel", panel: "edit" });
    expect(next.activePanel).toBe("edit");
  });

  it("opening another panel replaces the current one", () => {
    const withEdit = settingsReducer(base, {
      type: "open-panel",
      panel: "edit",
    });
    const next = settingsReducer(withEdit, {
      type: "open-panel",
      panel: "theme",
    });
    expect(next.activePanel).toBe("theme");
  });

  it("close-panel returns to no panel", () => {
    const withTheme = settingsReducer(base, {
      type: "open-panel",
      panel: "theme",
    });
    const next = settingsReducer(withTheme, { type: "close-panel" });
    expect(next.activePanel).toBeNull();
  });

  it("panel routing leaves toggle flags untouched", () => {
    const next = settingsReducer(base, {
      type: "open-panel",
      panel: "notifications",
    });
    expect(next.allowInvites).toBe(base.allowInvites);
    expect(next.notifFlags).toBe(base.notifFlags);
    expect(next.pushStatus).toBe(base.pushStatus);
  });
});

describe("reseed-from-profile", () => {
  it("reseeds notif flags when the profile signature changes", () => {
    const state = initialSettingsState(mkProfile());
    const refreshed = mkProfile({ push_invite_received: false });
    const next = settingsReducer(state, {
      type: "reseed-from-profile",
      profile: refreshed,
    });
    expect(next.notifFlags).toEqual({
      invite_received: false,
      invite_accepted: true,
      ownership_changed: true,
    });
    expect(next.lastNotifSignature).toBe(notifSignature(refreshed));
    // Unrelated allow-invites mirror untouched.
    expect(next.allowInvites).toBe(state.allowInvites);
    expect(next.lastProfileAllowInvites).toBe(state.lastProfileAllowInvites);
  });

  it("reseeds allow-invites when the profile flag changes", () => {
    const state = initialSettingsState(mkProfile());
    const refreshed = mkProfile({ allow_crew_invites: false });
    const next = settingsReducer(state, {
      type: "reseed-from-profile",
      profile: refreshed,
    });
    expect(next.allowInvites).toBe(false);
    expect(next.lastProfileAllowInvites).toBe(false);
    // Notif flags untouched — signature unchanged.
    expect(next.notifFlags).toBe(state.notifFlags);
  });

  it("clobbers an optimistic notif flip when the server disagrees", () => {
    // Optimistic flip without a matching server value...
    const state = initialSettingsState(mkProfile());
    const flipped = settingsReducer(state, {
      type: "set-notif-flag",
      category: "invite_accepted",
      value: false,
    });
    // ...then a profile refresh lands with a DIFFERENT signature —
    // the server wins, exactly like the old signature reconciler.
    const refreshed = mkProfile({ push_ownership_changed: false });
    const next = settingsReducer(flipped, {
      type: "reseed-from-profile",
      profile: refreshed,
    });
    expect(next.notifFlags.invite_accepted).toBe(true);
    expect(next.notifFlags.ownership_changed).toBe(false);
  });

  it("is a no-op (same reference) when nothing changed", () => {
    const profile = mkProfile({ allow_crew_invites: false });
    const state = initialSettingsState(profile);
    const next = settingsReducer(state, {
      type: "reseed-from-profile",
      profile,
    });
    expect(next).toBe(state);
  });

  it("does not clobber an optimistic flip when the signature is unchanged", () => {
    // Tap flips locally; a profile refresh arrives that still carries
    // the OLD value (write hasn't landed yet). Signature unchanged ⇒
    // the optimistic value must survive.
    const profile = mkProfile();
    const state = initialSettingsState(profile);
    const flipped = settingsReducer(state, {
      type: "set-notif-flag",
      category: "invite_received",
      value: false,
    });
    const next = settingsReducer(flipped, {
      type: "reseed-from-profile",
      profile,
    });
    expect(next.notifFlags.invite_received).toBe(false);
  });
});

describe("needsProfileReseed", () => {
  it("false when the profile matches the last seen values", () => {
    const profile = mkProfile();
    expect(needsProfileReseed(initialSettingsState(profile), profile)).toBe(
      false,
    );
  });

  it("true when notif prefs changed", () => {
    const state = initialSettingsState(mkProfile());
    expect(
      needsProfileReseed(state, mkProfile({ push_invite_accepted: false })),
    ).toBe(true);
  });

  it("true when allow_crew_invites changed", () => {
    const state = initialSettingsState(mkProfile());
    expect(
      needsProfileReseed(state, mkProfile({ allow_crew_invites: false })),
    ).toBe(true);
  });

  it("stays false after a reseed applied the new profile", () => {
    const state = initialSettingsState(mkProfile());
    const refreshed = mkProfile({
      allow_crew_invites: false,
      push_invite_received: false,
    });
    const next = settingsReducer(state, {
      type: "reseed-from-profile",
      profile: refreshed,
    });
    // Guard the render-loop invariant: one dispatch settles it.
    expect(needsProfileReseed(next, refreshed)).toBe(false);
  });

  it("optimistic flips do not re-trigger a reseed", () => {
    const profile = mkProfile();
    const state = initialSettingsState(profile);
    const flipped = settingsReducer(state, {
      type: "set-allow-invites",
      value: false,
    });
    expect(needsProfileReseed(flipped, profile)).toBe(false);
  });
});

describe("set-allow-invites (optimistic flip + revert)", () => {
  it("flips the flag", () => {
    const state = initialSettingsState(mkProfile());
    const next = settingsReducer(state, {
      type: "set-allow-invites",
      value: false,
    });
    expect(next.allowInvites).toBe(false);
    // The reseed key must NOT move — only real profile refreshes do.
    expect(next.lastProfileAllowInvites).toBe(true);
  });

  it("flip then revert restores the original value", () => {
    const state = initialSettingsState(mkProfile());
    const flipped = settingsReducer(state, {
      type: "set-allow-invites",
      value: false,
    });
    const reverted = settingsReducer(flipped, {
      type: "set-allow-invites",
      value: true,
    });
    expect(reverted.allowInvites).toBe(state.allowInvites);
    expect(reverted.lastProfileAllowInvites).toBe(
      state.lastProfileAllowInvites,
    );
  });
});

describe("set-notif-flag (optimistic flip + revert)", () => {
  it("flips only the targeted category", () => {
    const state = initialSettingsState(mkProfile());
    const next = settingsReducer(state, {
      type: "set-notif-flag",
      category: "ownership_changed",
      value: false,
    });
    expect(next.notifFlags).toEqual({
      invite_received: true,
      invite_accepted: true,
      ownership_changed: false,
    });
    // Signature key untouched — flips are local until the server
    // echoes them back through the profile.
    expect(next.lastNotifSignature).toBe(state.lastNotifSignature);
  });

  it("flip then revert restores the original flags", () => {
    const state = initialSettingsState(mkProfile());
    const flipped = settingsReducer(state, {
      type: "set-notif-flag",
      category: "invite_received",
      value: false,
    });
    const reverted = settingsReducer(flipped, {
      type: "set-notif-flag",
      category: "invite_received",
      value: true,
    });
    expect(reverted.notifFlags).toEqual(state.notifFlags);
  });
});

describe("set-push-status", () => {
  it("stores the probed status", () => {
    const state = initialSettingsState(mkProfile());
    const next = settingsReducer(state, {
      type: "set-push-status",
      status: "subscribed",
    });
    expect(next.pushStatus).toBe("subscribed");
  });

  it("subscribe → unsubscribe round-trip", () => {
    let state: SettingsState = initialSettingsState(mkProfile());
    state = settingsReducer(state, {
      type: "set-push-status",
      status: "subscribed",
    });
    state = settingsReducer(state, {
      type: "set-push-status",
      status: "granted",
    });
    expect(state.pushStatus).toBe("granted");
  });
});
