CREATE TYPE "public"."income_source" AS ENUM('parents', 'bourse', 'job', 'other');--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "income_source" "income_source";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_source" CHECK ("transactions"."income_source" is null or "transactions"."type" = 'income');