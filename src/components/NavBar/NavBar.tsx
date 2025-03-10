import { NavItem } from "@/components/NavItem/NavItem";
import { UserAccountNav } from "@/components/UserAccountNav/UserAccountNav";
import { Flex, Text } from "@radix-ui/themes";
import { BiHome, BiChart, BiSolidPlusCircle } from "react-icons/bi";

import styles from "./navBar.module.scss";

export function NavBar() {
  return (
    <Flex className={styles.container} px="4" py="2">
      <NavItem href="/">
        <BiHome size="24" />
        <Text as="span" size={"1"}>
          Home
        </Text>
      </NavItem>
      <NavItem href="/punchcard">
        <BiSolidPlusCircle size="48" />
      </NavItem>
      <UserAccountNav />
    </Flex>
  );
}
