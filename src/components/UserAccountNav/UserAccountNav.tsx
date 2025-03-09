import React from "react";
import { FaUser } from "react-icons/fa6";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "@/components/SignInButton/SignInButton";
import { SignOutButton } from "@/components/SignOutButton/SignOutButton";
import { Flex, DropdownMenu, Separator, Avatar } from "@radix-ui/themes";
import NextLink from "next/link";

export async function UserAccountNav() {
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();

  if (!user) {
    return <SignInButton />;
  }

  const avatarUrl = user.user_metadata?.avatar_url || null;
  const name = user.user_metadata?.name ?? "";
  // Get first letter for avatar fallback
  const firstLetter = name ? name.charAt(0).toUpperCase() : "";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <button
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="User menu"
        >
          <Avatar
            src={avatarUrl}
            fallback={firstLetter || <FaUser color="var(--gray-9)" />}
            size="4"
          />
        </button>
      </DropdownMenu.Trigger>

      {/* DROPDOWN CONTENT */}
      <DropdownMenu.Content>
        <Flex direction={"column"} gap={"2"}>
          <DropdownMenu.Item>
            <NextLink href="/profile">My Profile</NextLink>
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <NextLink href="/settings">Settings</NextLink>
          </DropdownMenu.Item>
          <Separator size="4" />
          <DropdownMenu.Item asChild>
            <SignOutButton />
          </DropdownMenu.Item>
        </Flex>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
