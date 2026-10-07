import next from "@mizania/config/eslint/next";

const config = [
  ...next,
  {
    // One-off CLI script; printing progress is its job.
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
];

export default config;
