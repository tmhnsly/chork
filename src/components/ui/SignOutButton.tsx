"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";

export function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Button variant="danger" type="button" onClick={signOut}>
      Sign out
    </Button>
  );
}
