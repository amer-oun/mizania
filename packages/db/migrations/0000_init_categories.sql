CREATE TYPE "public"."category_group" AS ENUM('fixed', 'envelope', 'daily', 'income');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"key" text NOT NULL,
	"names" jsonb NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"group" "category_group" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_default_key_unique" ON "categories" USING btree ("key") WHERE "categories"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_key_unique" ON "categories" USING btree ("user_id","key") WHERE "categories"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");