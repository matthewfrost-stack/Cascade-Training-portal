import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".venv/**",
      // Historical data-migration utilities are run manually and include a
      // mixture of CommonJS and legacy scripts outside the application build.
      "scripts/data-migration/**",
    ],
  },
  {
    // Phase 2: these are tracked for elimination but downgraded to warnings
    // so builds are not blocked while the typing work is in progress.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
      "react-hooks/exhaustive-deps": "warn",
      // These rules are not compatible with several established effect and
      // ref patterns in the existing app; keep them out of the migration
      // upgrade so lint remains an actionable signal.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
];
