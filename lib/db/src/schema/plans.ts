import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

// id is the stable plan catalog identifier.
export const plansTable = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stripePriceId: text("stripe_price_id"),
  oneTimePrice: real("one_time_price"),
  yearlyPrice: real("yearly_price"), // legacy display/rollback field
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
