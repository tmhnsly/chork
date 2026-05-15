import type { StorybookConfig } from "@storybook/nextjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sassLoadPaths = [
  path.join(process.cwd(), "node_modules"),
  path.join(process.cwd(), "src/styles"),
];

function patchSassConfig(obj: unknown): void {
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      if (typeof obj[i] === "string" && (obj[i] as string).includes("resolve-url-loader")) {
        obj.splice(i, 1);
      } else {
        patchSassConfig(obj[i]);
      }
    }
    return;
  }
  if (obj && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    if (
      typeof record.loader === "string" &&
      (record.loader as string).includes("sass-loader")
    ) {
      const opts = (record.options ?? {}) as Record<string, unknown>;
      opts.sassOptions = {
        includePaths: sassLoadPaths,
        loadPaths: sassLoadPaths,
      };
      opts.api = "modern-compiler";
      record.options = opts;
    }
    for (const val of Object.values(record)) {
      patchSassConfig(val);
    }
  }
}

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/nextjs",
  docs: {
    defaultName: "Docs",
  },
  sassOptions: {
    includePaths: sassLoadPaths,
  },
  webpackFinal: async (config) => {
    patchSassConfig(config.module?.rules);

    config.resolve = config.resolve ?? {};
    const stubPath = path.resolve(__dirname, "server-actions-stub.ts");
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> ?? {}),
      // Alias auth-context to the Storybook mock so components using
      // useAuth() get a mock provider that doesn't need next/navigation.
      "@/lib/auth-context": path.resolve(__dirname, "decorators.tsx"),
      // Server-only modules. Next.js production builds replace these
      // with RPC stubs at the client edge via the `"use server"`
      // boundary; Storybook's webpack doesn't honour that, so the
      // full modules + their server-only imports (node:crypto,
      // web-push → net/tls) get pulled into the browser bundle and
      // crash. Story renders never *call* these actions — they only
      // import them.
      //
      // Aliases use BOTH the `@/`-prefixed specifier AND the resolved
      // absolute path — tsconfig-paths resolves `@/` first, so the
      // unprefixed form is the one webpack ultimately sees. Listing
      // both is belt-and-braces.
      "@/lib/user-actions": stubPath,
      "@/lib/push/server": stubPath,
      [path.resolve(__dirname, "../src/lib/user-actions.ts")]: stubPath,
      [path.resolve(__dirname, "../src/lib/push/server.ts")]: stubPath,
    };

    return config;
  },
};

export default config;
