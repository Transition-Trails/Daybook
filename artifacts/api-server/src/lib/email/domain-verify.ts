import { Resend } from "resend";

const client = new Resend(process.env.RESEND_API_KEY);

export interface DnsRecord {
  type: string;   // "MX" | "TXT" | "CNAME"
  name: string;
  value: string;
  ttl: string | number;
  /** Per-record verification status returned by Resend */
  status: string; // "not_started" | "verified" | "failed"
}

export interface DomainInfo {
  id: string;
  name: string;
  /** Resend domain status: "not_started" | "pending" | "verified" | "failed" */
  status: string;
  records: DnsRecord[];
}

/** Register a new sending domain with Resend and get the DNS records to add. */
export async function registerDomain(domainName: string): Promise<DomainInfo> {
  const res = await client.domains.create({ name: domainName });
  if (res.error) throw new Error(`Resend domain create: ${res.error.message}`);
  return normaliseDomain(res.data!);
}

/**
 * Trigger Resend's DNS check for a previously registered domain,
 * then return the refreshed status and per-record results.
 */
export async function verifyDomain(resendDomainId: string): Promise<DomainInfo> {
  const vRes = await client.domains.verify(resendDomainId);
  if (vRes.error) throw new Error(`Resend domain verify: ${vRes.error.message}`);

  // Re-fetch to get fresh per-record statuses
  const gRes = await client.domains.get(resendDomainId);
  if (gRes.error) throw new Error(`Resend domain get: ${gRes.error.message}`);
  return normaliseDomain(gRes.data!);
}

/** Fetch current domain status from Resend (used for periodic re-checks). */
export async function getDomainStatus(resendDomainId: string): Promise<DomainInfo> {
  const res = await client.domains.get(resendDomainId);
  if (res.error) throw new Error(`Resend domain get: ${res.error.message}`);
  return normaliseDomain(res.data!);
}

/** Remove a domain from Resend (called when store removes custom domain). */
export async function deleteDomain(resendDomainId: string): Promise<void> {
  const res = await client.domains.remove(resendDomainId);
  if (res.error) throw new Error(`Resend domain delete: ${res.error.message}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseDomain(data: any): DomainInfo {
  return {
    id:     data.id,
    name:   data.name,
    status: data.status ?? "not_started",
    records: (data.records ?? []).map((r: any) => ({
      type:   r.type,
      name:   r.name,
      value:  r.value,
      ttl:    r.ttl ?? "auto",
      status: r.status ?? "not_started",
    })),
  };
}
