import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...storybook.configs["flat/recommended"],
  {
    // Honour the underscore-prefix convention we already use on
    // intentionally-unused params (e.g. `_userId`, `_table` in test
    // mocks). Without this the ESLint-CLI run flags them as warnings
    // because the Next-CLI wrapper previously suppressed them.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Cross-feature import guard for src/components/.
    //
    // Feature folders (Crew, Achievements, RouteLogSheet, …) should not
    // import from sibling feature folders directly — lift to ui/ or to
    // a shared parent component instead. Allowlist holds the atomic
    // visualisation primitives that ARE shared by design (named like
    // features but architecturally generic).
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/components/ui/**",
      "src/components/motion/**",
      "src/components/landing/**",
      "src/components/admin/**",
      "src/components/sections/**",
      "**/*.stories.tsx",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "@/components/*/*",
                "!@/components/ui/**",
                "!@/components/motion/**",
                "!@/components/landing/**",
                "!@/components/ActivityRings/**",
                "!@/components/CountUpNumber/**",
                "!@/components/RingStatsRow/**",
                "!@/components/RouteChart/**",
                "!@/components/StatsWidget/**",
                "!@/components/ScoringChart/**",
                "!@/components/RollingNumber/**",
                "!@/components/BadgeShelf/**",
              ],
              message:
                "Cross-feature component import. Lift to a shared parent (props/callbacks) or extract to components/ui/ instead.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default config;
