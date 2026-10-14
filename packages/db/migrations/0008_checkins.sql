CREATE TYPE "public"."checkin_kind" AS ENUM('match', 'unlogged_spending', 'unlogged_income');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"day" date NOT NULL,
	"expected_millimes" bigint NOT NULL,
	"counted_millimes" bigint NOT NULL,
	"kind" "checkin_kind" NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "checkins_counted_not_negative" CHECK ("checkins"."counted_millimes" >= 0),
	CONSTRAINT "checkins_transaction" CHECK (("checkins"."kind" = 'match') = ("checkins"."transaction_id" is null))
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_wallet_same_user_fk" FOREIGN KEY ("wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_cycle_same_user_fk" FOREIGN KEY ("cycle_id","user_id") REFERENCES "public"."cycles"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_user_id_idx" ON "checkins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkins_wallet_id_idx" ON "checkins" USING btree ("wallet_id");