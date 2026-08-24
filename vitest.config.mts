import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The tests cover the money — pure functions over an order, with no
 * database and no React. `@/` has to resolve the same way it does in the
 * app, and nothing else here needs configuring.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
