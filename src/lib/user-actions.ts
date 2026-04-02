"use server";

import { createServerPBFromCookies } from "./pocketbase-server";
import { cookieOptions, requireAuth } from "./auth";
import { USERNAME_RE, ALLOWED_USER_FIELDS } from "./validation";
import { formatPBError } from "./pb-error";

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
export async function mutateAuthUser(formData: FormData): Promise<{ error: string } | { success: true; cookie: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { pb, userId } = auth;

  // Strip any fields not in the allowlist
  const safeData = new FormData();
  for (const [key, value] of formData.entries()) {
    if (ALLOWED_USER_FIELDS.has(key)) {
      safeData.append(key, value);
    }
  }

  try {
    await pb.collection("users").update(userId, safeData);
    await pb.collection("users").authRefresh();
    const cookie = pb.authStore.exportToCookie(cookieOptions);
    return { success: true, cookie };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}
