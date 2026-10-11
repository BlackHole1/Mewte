import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "esnext",
  clean: true,
  // One self-contained file: the Docker image then needs no node_modules at all.
  deps: {
    alwaysBundle: [/.*/],
    neverBundle: [/^bun(:|$)/, "pg-native", "cloudflare:sockets"],
    onlyBundle: false,
  },
});
