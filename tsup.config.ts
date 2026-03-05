import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "functions/index.ts", "src/serve.ts", "src/serve/activityLog.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  target: "node18",
});
