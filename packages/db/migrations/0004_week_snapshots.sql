CREATE TABLE "week_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"week_index" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"allowance_millimes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_snapshots_cycle_week_unique" UNIQUE("cycle_id","week_index"),
	CONSTRAINT "week_snapshots_week_index_not_negative" CHECK ("week_snapshots"."week_index" >= 0),
	CONSTRAINT "week_snapshots_allowance_not_negative" CHECK ("week_snapshots"."allowance_millimes" >= 0),
	CONSTRAINT "week_snapshots_dates" CHECK ("week_snapshots"."ends_on" >= "week_snapshots"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_cycle_same_user_fk" FOREIGN KEY ("cycle_id","user_id") REFERENCES "public"."cycles"("id","user_id") ON DELETE cascade ON UPDATE no action;