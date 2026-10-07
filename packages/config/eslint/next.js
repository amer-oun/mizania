import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/** For the Next.js app. */
export default tseslint.config(
  ...nextVitals,
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    ignores: ["next-env.d.ts", "public/sw.js", "public/swe-worker-*.js"],
  },
);
