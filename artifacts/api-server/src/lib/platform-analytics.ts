const RECURRING_PAYMENT_SOURCES = new Set(["checkout", "async_checkout", "invoice"]);
const COHORT_WINDOW_DAYS = 30;
const MONTHS_IN_SERIES = 6;

export interface PlatformAnalyticsStore {
  ownerUserId: string;
  isSeed: boolean;
  createdAt: Date;
}

export interface PlatformAnalyticsUser {
  id: string;
  createdAt: Date;
  plan: string | null;
  planStatus: string | null;
  planCurrentPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
}

export interface PlatformAnalyticsPayment {
  userId: string | null;
  planId: string | null;
  source: string;
  status: string;
  amountCents: number | null;
  currency: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
}

export interface RevenueSeriesPoint {
  label: string;
  start: string;
  end: string;
  amountCents: number;
  amountUsd: number;
  paymentCount: number;
}

export interface TrialConversionSeriesPoint {
  label: string;
  start: string;
  end: string;
  eligibleUsers: number;
  convertedUsers: number;
  conversionRatePercent: number | null;
  isMature: boolean;
}

export interface PlatformBillingAnalytics {
  asOf: string;
  currency: "USD";
  period: {
    timezone: "UTC";
    months: number;
    start: string;
    end: string;
  };
  mrr: {
    amountUsd: number;
    activeSubscriptions: number;
    calculation: string;
  };
  revenueSeries: RevenueSeriesPoint[];
  trialConversion: {
    cohortWindowDays: number;
    definition: string;
    series: TrialConversionSeriesPoint[];
    latestMatured: TrialConversionSeriesPoint | null;
    previousMatured: TrialConversionSeriesPoint | null;
  };
}

function monthStart(date: Date, offset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function iso(date: Date): string {
  return date.toISOString();
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecurringUsdPayment(payment: PlatformAnalyticsPayment): boolean {
  return (
    RECURRING_PAYMENT_SOURCES.has(payment.source)
    && payment.status === "succeeded"
    && payment.userId !== null
    && payment.stripeSubscriptionId !== null
    && payment.amountCents !== null
    && Number.isFinite(payment.amountCents)
    && payment.currency?.toLowerCase() === "usd"
  );
}

function cohortIsMature(cohortEnd: Date, now: Date): boolean {
  return cohortEnd.getTime() + COHORT_WINDOW_DAYS * 24 * 60 * 60 * 1000 <= now.getTime();
}

export function buildPlatformBillingAnalytics(input: {
  now: Date;
  includeSeed?: boolean;
  stores: PlatformAnalyticsStore[];
  users: PlatformAnalyticsUser[];
  payments: PlatformAnalyticsPayment[];
}): PlatformBillingAnalytics {
  const { now, includeSeed = false } = input;
  const seriesStarts = Array.from({ length: MONTHS_IN_SERIES }, (_, index) => monthStart(now, index - (MONTHS_IN_SERIES - 1)));
  const seriesEnds = seriesStarts.map((start) => monthStart(start, 1));
  const seriesStart = seriesStarts[0];
  const seriesEnd = seriesEnds.at(-1)!;
  const eligibleOwnerIds = new Set(
    input.stores
      .filter((store) => includeSeed || !store.isSeed)
      .map((store) => store.ownerUserId),
  );
  const eligibleUsers = input.users.filter((user) => eligibleOwnerIds.has(user.id));
  const recurringPayments = input.payments
    .filter(isRecurringUsdPayment)
    .filter((payment) => eligibleOwnerIds.has(payment.userId!))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  const latestAnnualPaymentBySubscription = new Map<string, PlatformAnalyticsPayment>();
  for (const payment of recurringPayments.filter((row) => row.planId === "yearly")) {
    if (payment.createdAt > now) continue;
    const subscriptionId = payment.stripeSubscriptionId!;
    latestAnnualPaymentBySubscription.set(subscriptionId, payment);
  }

  let mrrCents = 0;
  let activeSubscriptions = 0;
  for (const user of eligibleUsers) {
    if (
      user.planStatus !== "active"
      || user.plan !== "yearly"
      || !user.stripeSubscriptionId
      || !user.planCurrentPeriodEnd
      || user.planCurrentPeriodEnd.getTime() <= now.getTime()
    ) continue;
    const latestPayment = latestAnnualPaymentBySubscription.get(user.stripeSubscriptionId);
    if (!latestPayment) continue;
    mrrCents += latestPayment.amountCents! / 12;
    activeSubscriptions += 1;
  }

  const revenueSeries: RevenueSeriesPoint[] = seriesStarts.map((start, index) => {
    const end = seriesEnds[index];
    const periodPayments = recurringPayments.filter((payment) => (
      payment.createdAt >= start && payment.createdAt < end
    ));
    const amountCents = periodPayments.reduce((sum, payment) => sum + (payment.amountCents ?? 0), 0);
    return {
      label: start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      start: iso(start),
      end: iso(end),
      amountCents,
      amountUsd: roundUsd(amountCents / 100),
      paymentCount: periodPayments.length,
    };
  });

  const firstPaymentByUser = new Map<string, PlatformAnalyticsPayment>();
  for (const payment of recurringPayments) {
    const userId = payment.userId!;
    if (!firstPaymentByUser.has(userId)) firstPaymentByUser.set(userId, payment);
  }

  const trialConversionSeries: TrialConversionSeriesPoint[] = seriesStarts.map((start, index) => {
    const end = seriesEnds[index];
    const isMature = cohortIsMature(end, now);
    const cohortUsers = eligibleUsers.filter((user) => (
      user.createdAt >= start
      && user.createdAt < end
    ));
    const convertedUsers = cohortUsers.filter((user) => {
      const firstPayment = firstPaymentByUser.get(user.id);
      if (!firstPayment) return false;
      const windowEnd = new Date(user.createdAt.getTime() + COHORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      return firstPayment.createdAt >= user.createdAt && firstPayment.createdAt <= windowEnd;
    }).length;
    return {
      label: start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      start: iso(start),
      end: iso(end),
      eligibleUsers: cohortUsers.length,
      convertedUsers,
      conversionRatePercent: isMature && cohortUsers.length > 0
        ? roundUsd((convertedUsers / cohortUsers.length) * 100)
        : null,
      isMature,
    };
  });

  const maturedPeriods = trialConversionSeries.filter((period) => period.isMature && period.eligibleUsers > 0);
  const latestMatured = maturedPeriods.at(-1) ?? null;
  const previousMatured = maturedPeriods.at(-2) ?? null;

  return {
    asOf: iso(now),
    currency: "USD",
    period: {
      timezone: "UTC",
      months: MONTHS_IN_SERIES,
      start: iso(seriesStart),
      end: iso(seriesEnd),
    },
    mrr: {
      amountUsd: roundUsd(mrrCents / 100),
      activeSubscriptions,
      calculation: "Latest successful USD platform subscription payment for each active yearly-plan subscription, divided by 12.",
    },
    revenueSeries,
    trialConversion: {
      cohortWindowDays: COHORT_WINDOW_DAYS,
      definition: `Each UTC calendar-month cohort contains eligible ${includeSeed ? "store owners, including seed-store owners," : "non-seed store owners"} created in that month. A user converts when their first successful USD platform subscription payment arrives within 30 days of account creation. Cohorts whose 30-day window has not elapsed are excluded from the rate.`,
      series: trialConversionSeries,
      latestMatured,
      previousMatured,
    },
  };
}