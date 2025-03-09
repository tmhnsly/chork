import { NavItem } from "@/components/NavItem/NavItem";
import { UserAccountNav } from "@/components/UserAccountNav/UserAccountNav";
import { Flex, Text } from "@radix-ui/themes";
import { BiHome, BiChart } from "react-icons/bi";

export function MainNav() {
  return (
    <Flex align="center" justify="between" px="4" py="2">
      <Flex gap="4" justify={"end"} align={"center"}>
        <NavItem href="/">
          <BiHome size="24" />
          <Text as="span" size={"1"}>
            Home
          </Text>
        </NavItem>
        <NavItem href="/stats">
          <BiChart size="24" />
          <Text size={"1"}>Stats</Text>
        </NavItem>
      </Flex>
      <UserAccountNav />
    </Flex>
  );
}
