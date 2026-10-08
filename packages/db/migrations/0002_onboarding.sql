CREATE TYPE "public"."cycle_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."plan_item_kind" AS ENUM('fixed', 'envelope', 'savings');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('quick', 'text', 'checkin', 'plan', 'household', 'manual');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('cash', 'd17', 'flouci', 'card', 'other');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_on" date NOT NULL,
	"expected_next_on" date NOT NULL,
	"actual_end_on" date,
	"status" "cycle_status" DEFAULT 'active' NOT NULL,
	"weekly_mode" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cycles_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "cycles_next_after_start" CHECK ("cycles"."expected_next_on" > "cycles"."started_on")
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"kind" "plan_item_kind" NOT NULL,
	"name" text,
	"category_id" uuid,
	"amount_millimes" bigint NOT NULL,
	"due_on" date,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "plan_items_amount_positive" CHECK ("plan_items"."amount_millimes" > 0),
	CONSTRAINT "plan_items_named" CHECK ("plan_items"."category_id" is not null or ("plan_items"."name" is not null and btrim("plan_items"."name") <> ''))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_id" uuid,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"category_id" uuid,
	"plan_item_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount_millimes" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"source" "transaction_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_sign" CHECK (("transactions"."type" = 'adjustment' and "transactions"."amount_millimes" <> 0)
        or ("transactions"."type" <> 'adjustment' and "transactions"."amount_millimes" > 0)),
	CONSTRAINT "transactions_transfer_target" CHECK (("transactions"."type" = 'transfer' and "transactions"."to_wallet_id" is not null and "transactions"."to_wallet_id" <> "transactions"."wallet_id")
        or ("transactions"."type" <> 'transfer' and "transactions"."to_wallet_id" is null))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "wallet_type" NOT NULL,
	"name" text,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wallets_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "wallets_name_only_for_other" CHECK (("wallets"."type" = 'other' and "wallets"."name" is not null and btrim("wallets"."name") <> '')
        or ("wallets"."type" <> 'other' and "wallets"."name" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usual_monthly_millimes" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usual_arrival_day" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_same_user_fk" FOREIGN KEY ("wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_wallet_same_user_fk" FOREIGN KEY ("to_wallet_id","user_id") REFERENCES "public"."wallets"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cycle_same_user_fk" FOREIGN KEY ("cycle_id","user_id") REFERENCES "public"."cycles"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cycles_user_id_idx" ON "cycles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_one_active_per_user" ON "cycles" USING btree ("user_id") WHERE "cycles"."status" = 'active' and "cycles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "plan_items_cycle_id_idx" ON "plan_items" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_wallet_id_idx" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "transactions_to_wallet_id_idx" ON "transactions" USING btree ("to_wallet_id");--> statement-breakpoint
CREATE INDEX "transactions_cycle_id_idx" ON "transactions" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_usual_monthly_positive" CHECK ("users"."usual_monthly_millimes" > 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_usual_arrival_day_range" CHECK ("users"."usual_arrival_day" between 1 and 31);