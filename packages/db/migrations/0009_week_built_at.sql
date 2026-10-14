ALTER TABLE "week_snapshots" ADD COLUMN "built_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing weeks were built when they were stored.
UPDATE "week_snapshots" SET "built_at" = "created_at";
