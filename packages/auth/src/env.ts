import { z } from "zod";

// `.env` lines like `SMTP_USER=` arrive as empty strings: treat them as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Production and local. Unset on Vercel Preview (see resolveBaseURL).
  BETTER_AUTH_URL: optional(z.url()),
  // Vercel system variables (hosts without protocol).
  VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
  VERCEL_URL: optional(z.string()),
  VERCEL_BRANCH_URL: optional(z.string()),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  EMAIL_FROM: z.string().min(1),

  // Google sign-in (optional: without them, only email + password).
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

/**
 * Reads and checks the variables auth needs. Throws one error listing every
 * missing or invalid variable (names only, never values).
 */
export function parseAuthEnv(source: Record<string, string | undefined> = process.env): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid auth environment:\n- ${problems.join("\n- ")}`);
  }
  return result.data;
}
