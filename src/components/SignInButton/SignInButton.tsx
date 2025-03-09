"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Flex } from "@radix-ui/themes";
import { NavIcons } from "@/components/NavIcons/NavIcons";

export function SignInButton() {
  const pathname = usePathname();

  return pathname !== "/signin" ? (
    <Link href="/signin" style={{ textDecoration: "none" }}>
      <Button variant="soft" size="2">
        <Flex align="center" gap="2">
          <NavIcons.logIn style={{ width: "14px", height: "14px" }} />
          Sign in
        </Flex>
      </Button>
    </Link>
  ) : null;
}
