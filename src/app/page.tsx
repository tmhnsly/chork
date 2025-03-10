import { Container, Heading, Text, Section, Flex } from "@radix-ui/themes";
import SignInDialog from "@/components/SignInDialog/SignInDialog";

export default function Home() {
  return (
    <main>
      <Section
        size={"4"}
        px={{ initial: "4", sm: "0" }}
        style={{ backgroundColor: "var(--slate-2)" }}
      >
        <Container size={"2"}>
          <Flex direction={"column"}>
            <Heading size={"9"}>🧗Chork</Heading>
            <Text size={"5"} mb={"9"}>
              Stick to your climbing goals.
            </Text>
            <SignInDialog />
          </Flex>
        </Container>
      </Section>
      <Section size={"1"} px={{ initial: "4", sm: "0" }}>
        <Container size={"2"}>
          <Flex direction={"column"} gap={"3"}>
            <Heading>What is Chork?</Heading>
            <Text>
              It&apos;s everybody&apos;s favourite white powder - for your
              phone.
            </Text>
            <Text>
              Track your climbs, collect achievements, and see your progress
              over time.
            </Text>
          </Flex>
        </Container>
      </Section>
    </main>
  );
}
