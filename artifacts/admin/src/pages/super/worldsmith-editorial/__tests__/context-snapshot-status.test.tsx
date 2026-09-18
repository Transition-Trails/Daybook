import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextSnapshotStatus, type ContextSnapshotEntityType } from "../ContextSnapshotStatus";

const { apiFetch, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const entityTypes: ContextSnapshotEntityType[] = [
  "production-specs", "component-specs", "style-guides", "prompt-modules",
  "collections", "volumes", "production-profiles", "punch-templates",
];

function renderStatus(entityType: ContextSnapshotEntityType) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContextSnapshotStatus entityType={entityType} entityId="record-1" />
    </QueryClientProvider>,
  );
}

describe("ContextSnapshotStatus", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.mockReset();
  });

  it.each(entityTypes)("loads status and updates the %s snapshot", async entityType => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve({ snapshot: { status: "current", githubPath: `world/${entityType}/record-1.md` } });
      return Promise.resolve({ snapshot: { status: "out_of_date", githubPath: `world/${entityType}/record-1.md` } });
    });

    renderStatus(entityType);
    await waitFor(() => expect(screen.getByText("out of date")).toBeInTheDocument());
    expect(apiFetch).toHaveBeenCalledWith(
      `/worldsmith/editorial/context-snapshots/${entityType}/record-1/status`,
    );
    expect(screen.getByText(`world/${entityType}/record-1.md`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update Context Snapshot" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      `/worldsmith/editorial/context-snapshots/${entityType}/record-1/update`,
      { method: "POST" },
    ));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Context Snapshot updated" }));
  });

  it("surfaces update failures to the editor", async () => {
    const error = new Error("GitHub publisher unavailable");
    apiFetch.mockImplementation((path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(error)
        : Promise.resolve({ status: "current", githubPath: "world/collections/record-1.md" }),
    );

    renderStatus("collections");
    await waitFor(() => expect(screen.getByText("current")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Update Context Snapshot" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: "Context Snapshot failed",
      description: "GitHub publisher unavailable",
      variant: "destructive",
    }));
  });
});