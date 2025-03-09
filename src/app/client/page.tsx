"use client";

import { useUser } from "@/hooks/use-user";
import { Box, Heading, Text } from "@radix-ui/themes";

export default function ClientPage() {
  const { loading, error, user, role } = useUser();

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {loading ? (
        <Text>Loading...</Text>
      ) : error ? (
        <Text>Error: {error.message}</Text>
      ) : (
        <>
          <Heading size="4">User: {user?.email || "N/A"}</Heading>
          <Heading size="4">Role: {role || "N/A"}</Heading>
        </>
      )}
      <Text color="gray">(I am a client component.)</Text>
    </Box>
  );
}
