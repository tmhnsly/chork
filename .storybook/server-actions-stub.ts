// Storybook stub for server-only modules.
//
// Two of them (`src/lib/user-actions.ts` + `src/lib/push/server.ts`)
// are server actions / server-only modules that import Node built-ins
// (`node:crypto`, `web-push` → `net`, `tls`). Next.js production builds
// resolve the `"use server"` boundary by replacing the module with an
// RPC stub at the client edge; Storybook's webpack-5 setup does NOT
// honour that boundary, so the full module gets pulled into the
// browser bundle and crashes the build.
//
// Story renders never *call* these actions — they import them only
// because a UI component (SettingsSheet, ProfileHeader) references
// them in its `onClick` handlers. The stub returns no-op shapes
// matching each export so the import resolves and TypeScript is
// happy.

const okResult = { error: "Stubbed in Storybook" };

export async function checkUsernameAvailable(): Promise<
  { available: boolean } | { error: string }
> {
  return { available: true };
}

export async function updateProfile(): Promise<typeof okResult> {
  return okResult;
}

export async function updateThemePreference(): Promise<typeof okResult> {
  return okResult;
}

export async function updatePushCategory(): Promise<typeof okResult> {
  return okResult;
}

export async function uploadAvatar(): Promise<
  { url: string } | { error: string }
> {
  return { url: "" };
}

export async function deleteAccount(): Promise<
  { error: string } | { success: true }
> {
  return { success: true };
}

export type PushCategoryKey =
  | "invite_received"
  | "invite_accepted"
  | "ownership_changed";

// push/server.ts exports
export function pushEnabled(): boolean {
  return false;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type PushCategory = PushCategoryKey;

export async function sendPushToUsers(): Promise<void> {
  // no-op
}

export function sendPushInBackground(): void {
  // no-op
}

export async function getGymClimberUserIds(): Promise<string[]> {
  return [];
}
