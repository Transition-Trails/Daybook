/*
 * D35: retain a local billing ledger so every successful Stripe payment can
 * point to the commerce order it produced.
 *
 * There is intentionally no historical backfill here. Before this migration
 * the application only retained the current Stripe identifiers on users; it
 * did not retain payment events, invoice amounts, or an order association.
 * Inventing orders from those incomplete current-state fields would create
 * misleading reconciliation data. New checkout and invoice events are written
 * with their complete correlation data by the billing route.
 */
CREATE TABLE IF NOT EXISTS "payments" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL,
  "user_id" text NOT NULL,
  "plan_id" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL DEFAULT 'succeeded',
  "stripe_event_id" text NOT NULL,
  "stripe_payment_intent_id" text,
  "stripe_subscription_id" text,
  "stripe_invoice_id" text,
  "amount_cents" integer,
  "currency" text,
  "last_lifecycle_event_id" text,
  "last_lifecycle_event_type" text,
  "last_lifecycle_event_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_plan_id_plans_id_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_event_id_uq"
  ON "payments" ("stripe_event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_payment_intent_id_uq"
  ON "payments" ("stripe_payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_order_id_idx" ON "payments" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_subscription_id_idx" ON "payments" ("stripe_subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments" ("stripe_invoice_id");