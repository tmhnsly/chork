"use client";

import { Flex } from "@radix-ui/themes";
import NextLink from "next/link";
// import { usePathname } from "next/navigation";

type NavItemProps = {
  href: string;
  children: React.ReactNode;
};

export function NavItem({ href, children }: NavItemProps) {
  // TODO: Add styles when a link is active
  //   const pathname = usePathname();
  //   const isActive = pathname === href;

  return (
    <NextLink href={href} passHref style={{ width: "48px", height: "48px" }}>
      <Flex direction={"column"} align={"center"} justify={"center"} gap={"1"}>
        {children}
      </Flex>
    </NextLink>
  );
}
