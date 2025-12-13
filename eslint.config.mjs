import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["out", "dist", "**/*.d.ts"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 6,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      "@typescript-eslint/naming-convention": "warn",
      "curly": "warn",
      "eqeqeq": "warn",
      "no-throw-literal": "warn",
      "semi": "warn",
    },
  },
];
