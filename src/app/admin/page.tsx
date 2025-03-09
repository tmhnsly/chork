import { createClient } from "@/lib/supabase/server";
import { Box, Heading, Text } from "@radix-ui/themes";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role");

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Heading size="4">Welcome admin!</Heading>
      <Heading size="3">User List:</Heading>
      {error ? (
        <Text>Error loading users: {error.message}</Text>
      ) : (
        <Box asChild style={{ margin: 0, padding: 0 }}>
          <ul>
            {users.map(({ id, email, role }) => (
              <Text key={id} size="2" color="gray">
                Email: {email}, Role: {role}
              </Text>
            ))}
          </ul>
        </Box>
      )}
    </Box>
  );
}
