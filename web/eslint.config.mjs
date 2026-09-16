import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  {
    // Browser-private profiles restore after hydration and paged lists reset
    // when their filtered source changes; both are intentional effects.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  globalIgnores(["dist/**", ".next/**", "node_modules/**"]),
]);
