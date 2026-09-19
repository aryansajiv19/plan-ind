import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Installed agent skills (npx skills add). Third-party source we neither
    // wrote nor ship — linting it buried this project's own findings under
    // thousands of foreign errors, including a parse error that made the
    // whole run useless. `.claude/skills` holds symlinks into the same tree.
    ".agents/**",
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
