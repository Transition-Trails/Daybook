import { db, aiCallReservationsTable, aiUsageRecordsTable, aiPricingTable } from "@workspace/db";
import { and, eq, gte, lt, or, sql, isNull, desc } from "drizzle-orm";

export type AiAdmission = {
  dedupeKey: string;
  provider: string;
  model: string;
  storeId?: string;
  fundingSource: "store" | "platform";
  configId?: number;
  requestsPerDay?: number | null;
  estimatedCentsPerMonth?: number | null;
  reservedCents?: number;
};

export function reservationScopeKey(
  funding: "store" | "platform",
  storeId: string | undefined,
  provider: string,
  configId?: number,
): string {
  return configId !== undefined
    ? `config:${configId}`
    : `${funding}:${funding === "platform" ? "platform" : storeId ?? "unattributed"}:${provider}`;
}
export function conservativeTextReservation(chars: number, inputCentsPerMillion: number, outputCentsPerMillion: number, monthlyLimited: boolean): number {
  if (!monthlyLimited) return 0;
  if (inputCentsPerMillion <= 0 || outputCentsPerMillion <= 0) throw new Error("Active positive AI text pricing is required for monthly quota admission");
  return Math.max(1, Math.ceil(((Math.ceil(chars / 4) * inputCentsPerMillion) + (2048 * outputCentsPerMillion)) / 1_000_000));
}
export function conservativeImageReservation(imageCents: number | null | undefined, monthlyLimited: boolean): number {
  if (!monthlyLimited) return 0;
  if (!imageCents || imageCents <= 0) throw new Error("Active positive AI image pricing is required for monthly quota admission");
  return imageCents;
}
export async function currentPricing(provider: string, model: string): Promise<{ input: number; output: number; image: number | null } | undefined> {
  const now = new Date();
  const [price] = await db.select().from(aiPricingTable).where(and(
    eq(aiPricingTable.provider, provider), eq(aiPricingTable.model, model),
    sql`${aiPricingTable.effectiveFrom} <= ${now}`,
    or(isNull(aiPricingTable.effectiveTo), sql`${aiPricingTable.effectiveTo} > ${now}`),
  )).orderBy(desc(aiPricingTable.effectiveFrom), desc(aiPricingTable.version)).limit(1);
  return price && { input: price.inputCentsPerMillion, output: price.outputCentsPerMillion, image: price.imageCents };
}

export async function reserveAiCall(input: AiAdmission): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reservationScopeKey(input.fundingSource, input.storeId, input.provider, input.configId)}))`);
    const now = new Date();
    await tx.delete(aiCallReservationsTable).where(and(
      eq(aiCallReservationsTable.status, "pending"),
      lt(aiCallReservationsTable.expiresAt, now),
    ));
    await tx.delete(aiCallReservationsTable).where(and(
      eq(aiCallReservationsTable.dedupeKey, input.dedupeKey),
      sql`${aiCallReservationsTable.status} in ('completed', 'failed')`,
    ));
    const [existing] = await tx.select({ id: aiCallReservationsTable.id })
      .from(aiCallReservationsTable)
      .where(and(eq(aiCallReservationsTable.dedupeKey, input.dedupeKey), eq(aiCallReservationsTable.status, "pending")))
      .limit(1);
    if (existing) throw new Error("An identical AI request is already in flight");

    const day = new Date(now.getTime() - 86_400_000);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const scope = input.fundingSource === "platform"
      ? eq(aiUsageRecordsTable.fundingSource, "platform")
      : eq(aiUsageRecordsTable.storeId, input.storeId!);
    const [count] = await tx.select({ value: sql<number>`count(*)` }).from(aiUsageRecordsTable)
      .where(and(gte(aiUsageRecordsTable.createdAt, day), eq(aiUsageRecordsTable.provider, input.provider), scope));
    const [pendingCount] = await tx.select({ value: sql<number>`count(*)` }).from(aiCallReservationsTable)
      .where(and(gte(aiCallReservationsTable.createdAt, day),
        eq(aiCallReservationsTable.fundingSource, input.fundingSource),
        sql`${aiCallReservationsTable.status} in ('pending', 'unaccounted')`,
        input.fundingSource === "store" ? eq(aiCallReservationsTable.scopeStoreId, input.storeId!) : sql`${aiCallReservationsTable.scopeStoreId} is null`));
    if (input.requestsPerDay !== null && input.requestsPerDay !== undefined &&
        Number(count?.value ?? 0) + Number(pendingCount?.value ?? 0) >= input.requestsPerDay) {
      throw new Error("AI daily request quota exceeded");
    }
    const [cost] = await tx.select({ value: sql<number>`coalesce(sum(${aiUsageRecordsTable.estimatedCostCents}), 0)` })
      .from(aiUsageRecordsTable).where(and(gte(aiUsageRecordsTable.createdAt, month), eq(aiUsageRecordsTable.provider, input.provider), scope));
    const [pendingCost] = await tx.select({ value: sql<number>`coalesce(sum(${aiCallReservationsTable.estimatedReservedCents}), 0)` })
      .from(aiCallReservationsTable).where(and(
        gte(aiCallReservationsTable.createdAt, month), eq(aiCallReservationsTable.fundingSource, input.fundingSource),
        sql`${aiCallReservationsTable.status} in ('pending', 'unaccounted')`,
        input.fundingSource === "store" ? eq(aiCallReservationsTable.scopeStoreId, input.storeId!) : sql`${aiCallReservationsTable.scopeStoreId} is null`));
    if (input.estimatedCentsPerMonth !== null && input.estimatedCentsPerMonth !== undefined &&
        Number(cost?.value ?? 0) + Number(pendingCost?.value ?? 0) + (input.reservedCents ?? 0) >= input.estimatedCentsPerMonth) {
      throw new Error("AI monthly cost quota exceeded");
    }
    const [row] = await tx.insert(aiCallReservationsTable).values({
      dedupeKey: input.dedupeKey, configId: input.configId,
      scopeStoreId: input.fundingSource === "store" ? input.storeId : null,
      fundingSource: input.fundingSource, estimatedReservedCents: input.reservedCents ?? 0,
      status: "pending", expiresAt: new Date(now.getTime() + 15 * 60_000),
    }).returning({ id: aiCallReservationsTable.id });
    return row!.id;
  });
}

export async function finishAiCall(id: number, status: "completed" | "failed" | "unaccounted"): Promise<void> {
  await db.update(aiCallReservationsTable).set({
    status,
    completedAt: status === "unaccounted" ? null : new Date(),
    expiresAt: status === "unaccounted" ? new Date("9999-12-31T00:00:00.000Z") : new Date(),
  })
    .where(eq(aiCallReservationsTable.id, id));
}