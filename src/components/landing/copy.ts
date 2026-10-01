/**
 * Every string on the marketing page, in the order the page says them.
 *
 * Headings are plain statements of what the section is about, in
 * words a stranger already owns — nothing coined, nothing that only
 * makes sense after the body. `copy.test.ts` pins the standing rules:
 * "game" or "competition", never "match"; "free to join", never a
 * permanence promise; "leaderboard", never "Chorkboard".
 */

export const HERO = {
  headline: "Log your sends. Compete with your mates.",
  body:
    "Chork turns every route you climb into points and puts you on a leaderboard with your friends — at your gym, or anywhere you climb. Free to join, nothing to install.",
  cta: "Join for free",
  deviceLabel:
    "Your card in Chork: where you stand on the leaderboard, and every route on the set as a tile coloured by what you did.",
} as const;

export const LOG = {
  headline: "Log a send in two taps.",
  body: "Tap the route you climbed and how many goes it took. That's it.",
  deviceLabel:
    "Your card: tapping route 4 opens its log sheet, two attempts are added, and the tile turns green when it's sent.",
} as const;

export const LADDER = {
  headline: "Fewer goes, more points.",
  body: "A flash is worth 4. Every extra go costs a point. Reach the zone and you still score.",
} as const;

export const BOARD = {
  headline: "See where you stand.",
  body: "Everyone climbing the same set shares one leaderboard. Log a send and it updates straight away.",
  deviceLabel: "The leaderboard: as you scroll, your points climb and you move up the podium, from third to first.",
} as const;

export const ANYWHERE = {
  headline: "Run your own competition, anywhere.",
  body: "Pick the routes, share a link, and Chork keeps score. Gym, crag or home wall — your gym doesn't need to be on Chork.",
  deviceLabel:
    "A game between six friends on a home wall: six routes, a shared board, and a send that takes you to first place.",
} as const;

export const QUIET = {
  headline: "Private, offline, nothing to install.",
  items: [
    { title: "Attempts are private.", body: "Points and flashes are public; how many goes it took is yours." },
    { title: "Beta stays hidden.", body: "Someone's hint stays covered until you've sent the route yourself." },
    { title: "Works offline.", body: "Log it in the basement; it catches up later." },
    { title: "No app store.", body: "Runs in your browser and installs to your home screen." },
  ],
} as const;

export const CONTACT = {
  headline: "Get in touch.",
  lead: "Questions, ideas, or want Chork at your gym?",
  action: "Email",
  address: "hello@chork.app",
} as const;

export const CLOSE = {
  headline: "Join Chork for free.",
  cta: "Join for free",
} as const;
