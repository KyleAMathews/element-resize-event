import js from "@eslint/js"
import globals from "globals"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig(
  { ignores: ["dist/", "example/bundle.js", ".isaac/", ".vitest/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Runtime code reaches into untyped legacy APIs (attachEvent, the sensor
    // <object>'s contentDocument) that are known to exist at those points.
    files: ["src/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    // Deliberately mirrors @types/element-resize-event usage, including
    // `import x = require()`.
    files: ["test/types.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
)
