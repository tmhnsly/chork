"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Flex } from "@radix-ui/themes";

import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast"; // Updated import path for our custom toast
import { NavIcons } from "@/components/NavIcons/NavIcons";

export default function SignInPage() {
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const supabase = createClient();

  const searchParams = useSearchParams();

  const next = searchParams.get("next");

  async function signInWithGoogle() {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback${
            next ? `?next=${encodeURIComponent(next)}` : ""
          }`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      toast({
        title: "Please try again.",
        description: "There was an error logging in with Google.",
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  }

  return (
    <Flex align="center" justify="center" direction="column" gap="4">
      <Button
        variant="classic"
        onClick={signInWithGoogle}
        disabled={isGoogleLoading}
        size={"4"}
      >
        {isGoogleLoading ? (
          <NavIcons.loaderCircle
            style={{ marginRight: "8px", width: "16px", height: "16px" }}
            className="animate-spin"
          />
        ) : (
          <NavIcons.google
            style={{ marginRight: "8px", width: "24px", height: "24px" }}
          />
        )}{" "}
        Sign in with Google
      </Button>
    </Flex>
  );
}
