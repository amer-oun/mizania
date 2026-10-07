import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
  // Internal @mizania/* packages ship TypeScript source, so bundle them.
  deps: { alwaysBundle: [/^@mizania\//] },
});
