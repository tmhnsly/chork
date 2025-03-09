import "server-only";

import { JWTPayload, jwtVerify } from "jose";
import { createClient } from "@/lib/supabase/server";

// Extend the JWTPayload type to include Supabase-specific metadata
type SupabaseJwtPayload = JWTPayload & {
  app_metadata: {
    role: string;
  };
};

export async function getUserRole() {
  // ✅ Fix: Await the client
  const supabase = await createClient();

  // Retrieve the current session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let role;

  if (session) {
    try {
      const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify<SupabaseJwtPayload>(
        session.access_token,
        secret
      );
      role = payload.app_metadata.role;
    } catch (error) {
      console.error("Failed to verify token:", error);
    }
  }

  return role;
}
