import js from "@eslint/js";
import json from "@eslint/json";

export default [
  {
    ignores: ["node_modules/**", "backend/**", "dist/**", "build/**"],
  },

  {
    files: ["**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
    },
  },

  {
    files: ["**/*.json"],
    plugins: {
      json,
    },
    language: "json/json",
    rules: {
      "json/no-duplicate-keys": "error",
    },
  },
];
