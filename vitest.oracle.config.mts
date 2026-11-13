import { defineConfig } from "vitest/config"

// Oracle files run under Node, apart from the browser suite in
// vitest.config.ts: the gap check's harness needs Node.
export default defineConfig({
  test: { include: ["test/**/*.oracle.ts"], environment: "node" },
})
