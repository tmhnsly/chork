import type { StorybookConfig } from "@storybook/nextjs";
import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

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

    // Node built-ins reached from the browser bundle.
    //
    // The alias list below stubs specific server-only modules, but it
    // only covers the ones someone remembered — and it silently rots,
    // because a NEW component importing a NEW server action pulls the
    // whole module graph in again and the build dies with an opaque
    // "UnhandledSchemeError: node:crypto". That is what happened here:
    // `@/app/match/actions` reaches `shared-result.ts`, which uses
    // `randomBytes` to mint share tokens.
    //
    // Fix the class rather than the instance. Webpack 5 doesn't
    // understand the `node:` scheme at all, so strip the prefix and
    // then let the normal browser fallbacks resolve it to nothing.
    // Stories never CALL server actions — they only import them, so
    // an absent implementation is exactly right.
    // Webpack 5 rejects the `node:` scheme outright, BEFORE alias or
    // fallback resolution gets a look — so aliasing "node:crypto" to
    // false does nothing. Strip the prefix first, then the fallbacks
    // below resolve the bare name to nothing.
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );

    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback as Record<string, false | string> ?? {}),
      crypto: false, fs: false, net: false, tls: false, path: false,
      stream: false, os: false, zlib: false, http: false, https: false,
    };
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
