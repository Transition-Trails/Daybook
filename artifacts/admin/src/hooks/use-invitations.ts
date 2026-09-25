import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, storesApi } from "@/lib/api";

export type InviteRole = "super_admin" | "store_owner" | "store_staff" | "support";
export interface Invitation {
  id: string;
  email: string;
  role: InviteRole;
  storeId: string | null;
  storeName?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
}
export interface InvitationPreview {
  email: string;
  role: InviteRole;
  storeName?: string | null;
  expiresAt: string;
  accountExists: boolean;
  requiresSignIn: boolean;
}

export function useInvitations() {
  return useQuery({
    queryKey: ["users", "invitations"],
    queryFn: () => apiFetch<{ invitations: Invitation[] }>("/users/invitations"),
    refetchOnMount: "always",
  });
}

export function useInvitationStores() {
  return useQuery({
    queryKey: ["stores", "invitation-picker"],
    queryFn: () => storesApi.list(),
  });
}

export function useSendInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: InviteRole; storeId?: string }) =>
      apiFetch<Pick<Invitation, "id" | "email" | "role" | "storeId" | "expiresAt">>("/users/invitations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["users", "invitations"] }),
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["auth", "invitation-preview", token],
    queryFn: () => apiFetch<InvitationPreview>(`/auth/invitations/preview?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (data: { token: string; name?: string; password?: string }) =>
      apiFetch<{ success: true }>("/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}