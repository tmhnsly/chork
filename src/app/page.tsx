import { Container, Heading, Text, Section } from "@radix-ui/themes";

export default function Home() {
  return (
    <main>
      <Container>
        <Section size={"2"}>
          <Heading size={"9"} mb={"4"}>
            Welcome to Chork
          </Heading>
          <Text>
            Here is a second section, where more things go. Here is where
            we&apos;ll add some text for a body of content. This can include
            paragraphs about features, benefits, or anything relevant to the
            Chork application. The content should be informative and engaging to
            help users understand what Chork offers.
          </Text>
        </Section>
      </Container>
    </main>
  );
}
