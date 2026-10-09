-- Phone recharge is now an envelope (ADR 006): it's topped up several times a
-- month and logged with quick log. Onboarding used to plan it as a fixed cost.
-- Those plan items become envelopes, so top-ups use them first instead of
-- counting twice (as daily spending, while the fixed cost stayed reserved).
--
-- Only unpaid ones without payments change: a paid one reserves nothing, and
-- its top-ups this month simply count as daily money. Safe to run again.
UPDATE "plan_items"
SET "kind" = 'envelope', "updated_at" = now()
WHERE "kind" = 'fixed'
  AND "paid_at" IS NULL
  AND "deleted_at" IS NULL
  AND "category_id" IN (
    SELECT "id" FROM "categories" WHERE "key" = 'phone_recharge' AND "user_id" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "transactions"
    WHERE "transactions"."plan_item_id" = "plan_items"."id"
      AND "transactions"."deleted_at" IS NULL
  );
