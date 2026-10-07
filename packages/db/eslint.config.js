import node from "@mizania/config/eslint/node";

export default [
  ...node,
  {
    // migrate/seed are CLI scripts; printing progress is their job.
    files: ["src/migrate.ts", "src/seed.ts"],
    rules: { "no-console": "off" },
  },
];
