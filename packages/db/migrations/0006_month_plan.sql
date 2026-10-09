ALTER TABLE "plan_items" DROP CONSTRAINT "plan_items_named";--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN "covers_from" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_one_savings_per_cycle" ON "plan_items" USING btree ("cycle_id") WHERE "plan_items"."kind" = 'savings' and "plan_items"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_named" CHECK ("plan_items"."kind" = 'savings' or "plan_items"."category_id" is not null or ("plan_items"."name" is not null and btrim("plan_items"."name") <> ''));