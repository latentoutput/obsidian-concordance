import eslintConfigPrettier from "eslint-config-prettier";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

// Obsidian's guideline rules describe plugin code running inside Obsidian, so
// they only make sense for src/. Applied repo-wide they flag every Node import
// and console.log in our build scripts, which run on a developer machine and
// never ship. The community directory's own scanner skips the same paths
// (scripts, docs, test-vault, *.mjs, *.test.*), so linting them here would
// report failures the review never sees.
//
// The package.json entries keep their own targeting, since they lint
// dependency choices rather than source.
const obsidianmdForSource = obsidianmd.configs.recommended.map((config) =>
  Array.isArray(config.files) && config.files.includes("package.json")
    ? config
    : { ...config, files: ["src/**/*.ts"], ignores: ["src/**/*.test.ts"] },
);

export default [
  {
    // test-vault is fixture data, including any plugin build installed into it
    ignores: ["main.js", "node_modules/**", "test-vault/**"],
  },
  ...tseslint.configs.recommended,
  ...obsidianmdForSource,
  eslintConfigPrettier,
  {
    files: ["src/**/*.ts"],
    plugins: { obsidianmd },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // "Concordance" is the plugin's name, so it stays capitalised wherever it
      // appears in UI prose. Without this the rule reads it as a stray capital.
      // ignoreRegex skips multi-line strings: the only ones we have are
      // newline-delimited example lists in textarea placeholders, which are
      // sample folder and search terms rather than sentences.
      "obsidianmd/ui/sentence-case": ["warn", { brands: ["Concordance"], ignoreRegex: ["\\n"] }],
    },
  },
];
