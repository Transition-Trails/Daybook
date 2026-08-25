export type GoogleAuditMembership = {
  storeId: string;
  role: string;
};

type GoogleAuditActorInput = {
  platformRole: string | null;
  selectedStoreId?: string;
  memberships: GoogleAuditMembership[];
};

const STORE_ROLES = new Set(["store_owner", "store_staff", "support", "customer"]);

/**
 * Resolves the actor identity written for a personal Google-sync action.
 * Memberships must be sorted by store ID before this function is called.
 */
export function resolveGoogleAuditActor({
  platformRole,
  selectedStoreId,
  memberships,
}: GoogleAuditActorInput): { actorRole: string; scope: string } {
  if (platformRole === "super_admin") {
    return { actorRole: "super_admin", scope: "platform" };
  }

  const membership = selectedStoreId
    ? memberships.find((candidate) => candidate.storeId === selectedStoreId)
    : memberships[0];
  if (!membership || !STORE_ROLES.has(membership.role)) {
    return { actorRole: "user", scope: "platform" };
  }

  return { actorRole: membership.role, scope: membership.storeId };
}