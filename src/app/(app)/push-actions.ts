"use server";

import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Push notification subscriptions
// ────────────────────────────────────────────────────────────────
// Climber opts in from a UI toggle; PushManager.subscribe returns the
// endpoint + keys which we persist here. RLS on push_subscriptions
// (migration 014) allows a user to manage only their own rows, so the
// authed supabase client below is enough — no service role needed.

/**
 * Push-subscription endpoints must be real HTTPS URLs pointing at a
 * browser push service — otherwise `web-push` rejects the dispatch
 * anyway. Validating here keeps malformed strings out of the DB in
 * the first place (defense-in-depth for any future code path that
 * exposes the endpoint).
 */
function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && endpoint.length >= 10;
  } catch {
    return false;
  }
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  if (typeof input.endpoint !== "string" || !isValidPushEndpoint(input.endpoint)) {
    return { error: "Invalid subscription." };
  }
  if (typeof input.p256dh !== "string" || typeof input.auth !== "string") {
    return { error: "Invalid subscription keys." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const rl = await enforceRateLimit("pushSubscribe", userId);
  if (!rl.ok) return { error: rl.error };

  try {
    // Dedupe by device key (p256dh) rather than endpoint. When a push
    // service rotates the endpoint URL on the same device, the
    // p256dh + auth keypair stays stable — we can identify "this is
    // the same browser/device" and replace just its prior endpoint
    // without affecting any other device the user has subscribed.
    //
    // Naive "delete all other endpoints for this user" would break
    // multi-device users (phone + tablet → each has its own endpoint
    // AND its own p256dh; deleting "others" would drop pushes to the
    // sibling device). The scoped delete by p256dh dedupes the
    // rotation case without touching foreign devices.
    //
    // The post-send 404/410 GC in lib/push/server.ts handles the
    // rest of the stale-endpoint surface (e.g. a uninstalled PWA
    // that never re-subscribes).
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("p256dh", input.p256dh)
      .neq("endpoint", input.endpoint);

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        { onConflict: "user_id,endpoint" }
      );
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function removePushSubscription(
  endpoint: string
): Promise<ActionResult> {
  if (typeof endpoint !== "string" || !isValidPushEndpoint(endpoint)) {
    return { error: "Invalid subscription." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
