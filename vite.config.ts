// This config wrapper bundles: TanStack devtools, tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, nitro (Cloudflare target), VITE_* env injection,
// @ path alias, React/TanStack dedupe, and error logger plugins.
// Do NOT add these manually or the app will break with duplicate plugins.
// Pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
//
// TODO: Replace @lovable.dev/vite-tanstack-config with direct plugin setup
// when migrating off this dependency.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Pin the local preview to a Wrangler-supported date. Cloudflare deployments can
  // raise this deliberately after their Wrangler/runtime version is upgraded.
  nitro: { compatibilityDate: "2026-05-03" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
