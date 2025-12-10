// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  // Presets Next
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // 👇 overrides après les presets (pour gagner)
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // (optionnel) réduire le bruit
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/exhaustive-deps": "warn"
    }
  },

  // (optionnel) ignore global
  {
    ignores: [
      ".next/**",
      "node_modules/**"
    ]
  }
];
