import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

// id is "yearly" or "lifetime" — matches the Plan enum in spec/schema.json
export const plansTable = pgTable("plans", {
  id: text("id").primaryKey(), // "yearly" | "lifetime"
  name: text("name").notNull(),
  description: text("description"),
  oneTimePrice: real("one_time_price"),
  yearlyPrice: real("yearly_price"), // maintenance fee for "yearly" plan; null for "lifetime"
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
