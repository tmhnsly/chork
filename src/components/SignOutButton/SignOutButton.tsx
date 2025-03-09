"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@radix-ui/themes";

export function SignOutButton() {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/signin");
    router.refresh();
  }

  return (
    <Button
      variant="soft"
      color="red"
      size="2"
      style={{ width: "100%" }}
      onClick={handleLogout}
    >
      Sign out
    </Button>
  );
}
