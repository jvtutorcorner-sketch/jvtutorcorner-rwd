import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next, but glob-anchored rather than
    // root-anchored: ESLint 9 flat config does not read .gitignore, so a
    // root-only ".next/**" left every .claude/worktrees/**/.next/ build artifact
    // in scope. That was 110,678 of 114,848 reported problems — invisible to CI
    // (.gitignore covers .claude/) but it made a local `npm run lint` look
    // hopeless, which is why ci.yml carried continue-on-error.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/node_modules/**",
    "next-env.d.ts",
    // Gitignored working directories — never part of the reviewable tree.
    ".claude/**",
    "tmp/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    // Vendored, minified third-party bundles. public/pdf.worker.min.mjs alone
    // produced 1,520 warnings (61% of all real warnings) from one file we do
    // not author.
    "public/pdf.worker*.mjs",
    "public/**/*.min.js",
    "public/**/*.min.mjs",
  ]),
  // Project-specific overrides: relax noisy rules in legacy server-side libs
  {
    // Ambient module declarations for untyped third-party packages: `any` is the
    // point of the shim, not laziness.
    files: ["types/**/*.d.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" }
  },
  {
    files: ["lib/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off"
    }
  }
]);

export default eslintConfig;
