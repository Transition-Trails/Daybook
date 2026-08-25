import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SyncDashboard from "@/pages/sync";

const {
  mockGetSyncStatus,
  mockCustomFetch,
  mockPushPlanner,
  mockDriveBackup,
  mockToast,
} = vi.hoisted(() => ({
  mockGetSyncStatus: vi.fn(),
  mockCustomFetch: vi.fn(),
  mockPushPlanner: vi.fn(),
  mockDriveBackup: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetSyncStatus: mockGetSyncStatus,
  usePushPlannerToCalendar: mockPushPlanner,
  useDriveBackup: mockDriveBackup,
  getGetSyncStatusQueryKey: () => ["/api/sync/status"],
  customFetch: mockCustomFetch,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SyncDashboard />
    </QueryClientProvider>,
  );
}

describe("Google Sync temporary retry state", () => {
  it("keeps the account connected, hides reconnect, and pauses sync actions", () => {
    mockGetSyncStatus.mockReturnValue({
      data: {
        connected: true,
        retrying: true,
        calendarLastSynced: null,
        tasksLastSynced: null,
        docsLastSynced: null,
        driveLastSynced: null,
        driveFolder: null,
      },
      isLoading: false,
      error: null,
    });
    mockCustomFetch.mockResolvedValue({ pushes: [] });
    mockPushPlanner.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockDriveBackup.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderDashboard();

    expect(screen.getByText("Retrying Google")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("account is still connected");
    expect(screen.queryByText("Connect Google Workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reconnect Google/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Push Event/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Sync$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Backup Now/i })).toBeDisabled();
  });
});