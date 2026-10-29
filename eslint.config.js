import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // Regra do projeto: variáveis de ambiente só são lidas em config.ts, validadas com Zod (ver CLAUDE.md).
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Leia variáveis de ambiente apenas no config.ts do app, via parseEnv (@nexo/shared/config).",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Únicos lugares autorizados a ler process.env.
    files: ["**/config.ts", "*.config.ts", "*.config.js"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
