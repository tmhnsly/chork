import { Container, Heading, Text, Section, Flex } from "@radix-ui/themes";

export default function Home() {
  return (
    <main>
      <Section
        size={"4"}
        px={{ initial: "4", sm: "0" }}
        style={{ backgroundColor: "var(--slate-2)" }}
      >
        <Container size={"2"}>
          <Flex align={"end"} direction={"column"}>
            <Heading size={"9"}>Chork</Heading>
            <Text size={"3"}>Stick to your climbing goals.</Text>
          </Flex>
        </Container>
      </Section>
      <Section size={"1"} px={{ initial: "4", sm: "0" }}>
        <Container size={"2"}>
          <Heading>What?</Heading>
          <Text>
            Chork is a simple app to help you get to grip on your climbing
            goals. Whether you&apos;re a seasoned pro or just starting out,
            Chork helps you track your progress and stay motivated.
          </Text>
        </Container>
      </Section>
    </main>
  );
}
