"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Flex, Dialog } from "@radix-ui/themes";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { BiAnalyse, BiLogoGoogle } from "react-icons/bi";
import styles from "./SignInDialog.module.scss";

export default function SignInDialog() {
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
    <Dialog.Root>
      <Dialog.Trigger>
        <Button size="4" variant="soft">
          Sign in
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="450px">
        <Dialog.Title>Sign in</Dialog.Title>
        <Dialog.Description mb={"5"}>
          Select authentication provider.
        </Dialog.Description>
        <Flex align="center" justify="center" direction="column" gap="4">
          <Button
            variant="soft"
            onClick={signInWithGoogle}
            disabled={isGoogleLoading}
            size="4"
          >
            <span className={styles.iconContainer}>
              {isGoogleLoading ? (
                <BiAnalyse className={styles.loaderIcon} />
              ) : (
                <BiLogoGoogle className={styles.googleIcon} />
              )}
            </span>{" "}
            Sign in with Google
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
