import React from "react";
import { BiAnalyse, BiUser } from "react-icons/bi";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton/SignOutButton";
import { Flex, DropdownMenu, Separator, Avatar, Text } from "@radix-ui/themes";
import NextLink from "next/link";

import styles from "./userAccountNav.module.scss";

export async function UserAccountNav() {
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();

  // Show loading spinner while user data is being fetched
  if (!user) {
    return (
      <div className={styles.spinnerContainer}>
        <BiAnalyse size={"24"} />
      </div>
    );
  }

  const avatarUrl = user.user_metadata?.avatar_url || null;
  const name = user.user_metadata?.name ?? "";
  // Get first letter for avatar fallback
  const firstLetter = name ? name.charAt(0).toUpperCase() : "";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <button className={styles.userMenuButton} aria-label="User menu">
          <Avatar
            src={avatarUrl}
            fallback={firstLetter || <BiUser color="var(--gray-9)" />}
            size="4"
            radius="large"
          />
        </button>
      </DropdownMenu.Trigger>
      {/* DROPDOWN CONTENT */}
      <DropdownMenu.Content>
        <Flex direction={"column"} gap={"2"} style={{ width: "150px" }}>
          <DropdownMenu.Item asChild>
            <NextLink href="/profile">
              <Flex align="center" gap="2" justify={"between"} width={"100%"}>
                <Text>My Profile</Text>
                <BiUser size={"16"} />
              </Flex>
            </NextLink>
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
