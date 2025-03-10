"use client";

import { useUser } from "@/hooks/use-user";
import {
  Avatar,
  Box,
  Card,
  Container,
  Flex,
  Section,
  Text,
} from "@radix-ui/themes";

export default function ClientPage() {
  const { loading, error, user } = useUser();

  if (user) {
    console.log(user);
  }

  return (
    <Container>
      <Section px={{ initial: "4", sm: "0" }}>
        <Box style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading ? (
            <Text>Loading...</Text>
          ) : error ? (
            <Text>Error: {error.message}</Text>
          ) : (
            <Box maxWidth="240px">
              <Card>
                <Flex gap="3" align="center">
                  <Avatar
                    size="3"
                    src={
                      user?.user_metadata.avatar_url ||
                      "https://images.unsplash.com/photo-1607346256330-dee7af15f7c5?&w=64&h=64&dpr=2&q=70&crop=focalpoint&fp-x=0.67&fp-y=0.5&fp-z=1.4&fit=crop"
                    }
                    radius="full"
                    fallback={
                      user?.user_metadata.name.charAt(0).toUpperCase() || "T"
                    }
                  />
                  <Box>
                    <Text as="div" size="2" weight="bold">
                      {user?.user_metadata.name || "Teodros Girmay"}
                    </Text>
                    <Text as="div" size="2" color="gray">
                      {user?.email || "Engineering"}
                    </Text>
                  </Box>
                </Flex>
              </Card>
            </Box>
          )}
        </Box>
      </Section>
    </Container>
  );
}
