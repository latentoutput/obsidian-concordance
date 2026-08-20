import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The obsidian package ships types only, so importing it for values at
      // runtime needs a stand-in. See test/obsidian-stub.ts.
      obsidian: fileURLToPath(new URL("./test/obsidian-stub.ts", import.meta.url)),
    },
  },
});
