"use server";

import { createServerPBFromCookies } from "./pocketbase-server";
import { cookieOptions } from "./pocketbase";
import { formatPBError } from "./pb-error";

const USERNAME_RE = /^[a-z0-9_]+$/;

/** Fields that can be updated on a user record via mutateAuthUser. */
const ALLOWED_USER_FIELDS = new Set([
  "username",
  "name",
  "avatar",
  "onboarded",
]);

/**
 * Check if a username is available. Validates format server-side
 * before querying PocketBase to prevent filter injection.
 */
export async function checkUsernameAvailable(
  username: string,
  userId: string
): Promise<boolean> {
  if (!username || username.length < 3 || !USERNAME_RE.test(username)) {
    return false;
  }
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("users").getList(1, 1, {
    filter: pb.filter("username = {:username} && id != {:userId}", {
      username,
      userId,
    }),
  });
  return results.totalItems === 0;
}

/**
 * Update the authenticated user's record with whitelisted fields only.
 * Refreshes auth and returns the updated cookie for the client.
 */
export async function mutateAuthUser(formData: FormData) {
  const pb = await createServerPBFromCookies();

  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  // Strip any fields not in the allowlist
  const safeData = new FormData();
  for (const [key, value] of formData.entries()) {
    if (ALLOWED_USER_FIELDS.has(key)) {
      safeData.append(key, value);
    }
  }

  try {
    await pb.collection("users").update(pb.authStore.record.id, safeData);
    await pb.collection("users").authRefresh();
    const cookie = pb.authStore.exportToCookie(cookieOptions);
    return { success: true, cookie };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}
