import type { Preview } from "@storybook/nextjs";
import React from "react";
import { ThemeProvider } from "@/lib/theme";
import "./storybook.scss";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
    layout: "centered",
    // Tells @storybook/nextjs to mock next/navigation. Without it
    // `usePathname()` and `useSearchParams()` return null, and the
    // stories that read them died on "Cannot read properties of null"
    // — NavBar (which highlights the active tab by pathname) and the
    // login page (which reads its redirect target from the query).
    nextjs: {
      appDirectory: true,
    },
  },
  tags: ["autodocs"],
  globalTypes: {
    theme: {
      description: "Color theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    // Light/dark, driven by the toolbar. Two orthogonal systems, per
    // CLAUDE.md: the `.dark` class is what next-themes writes, and
    // `data-theme` is our own palette store.
    (Story, context) => {
      const theme = context.globals.theme || "light";
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.setAttribute("data-theme", theme);
      return Story();
    },
    // `useTheme` throws outside its provider rather than returning a
    // default — a deliberate choice in theme.tsx, and one that made
    // every story rendering ProfileHeader unviewable. The real
    // provider is cheap (a `useSyncExternalStore` over a tiny store)
    // and needs no auth, so stories get the real thing rather than a
    // second mock to keep in step.
    (Story) => React.createElement(ThemeProvider, null, Story()),
  ],
};

export default preview;
