import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/** For Node processes (api, worker, db scripts). */
export default tseslint.config(...base, {
  languageOptions: {
    globals: globals.node,
  },
});
