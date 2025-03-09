import { getUserRole } from "@/lib/get-user-role";
import { createClient } from "@/lib/supabase/server";
import { Box, Heading, Text } from "@radix-ui/themes";

export default async function ServerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = await getUserRole();

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Heading size="4">User: {user?.email || "N/A"}</Heading>
      <Heading size="4">Role: {role || "N/A"}</Heading>
      <Text color="gray">(I am a server component.)</Text>
    </Box>
  );
}
