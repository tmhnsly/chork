"use client";

import NextLink from "next/link";
// import { usePathname } from "next/navigation";
import styles from "./navItem.module.scss";

type NavItemProps = {
  href: string;
  children: React.ReactNode;
};

export function NavItem({ href, children }: NavItemProps) {
  // TODO: Add styles when a link is active
  //   const pathname = usePathname();
  //   const isActive = pathname === href;

  return (
    <NextLink href={href} passHref className={styles.container}>
      {children}
    </NextLink>
  );
}
