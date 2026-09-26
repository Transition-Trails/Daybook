import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlanningReadinessBoard from "../PlanningReadinessBoard";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({ selectedWorldId: "world-7", selectedWorld: { name: "North Archive" } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

const record = {
  id: "canon-4",
  title: "The Glass Observatory",
  subtitle: "A place above the harbor",
  lane: "backlog",
  revision: 3,
  href: "/super/worldsmith/editorial/canon/canon-4",
};

function setup() {
  let saved = { ...record };
  apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (typeof url !== "string") return undefined;
    if (options?.method === "PATCH") {
      const body = JSON.parse(options.body!);
      saved = { ...saved, lane: body.lane, revision: saved.revision + 1 };
      return { card: saved };
    }
    if (url.startsWith("/v1/editorial/readiness-planning?")) {
      return { boards: { canon_records: [saved], storylines: [], beats: [] } };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanningReadinessBoard entityType="canon_records" />
    </QueryClientProvider>,
  );
}

describe("planning readiness lanes", () => {
  beforeEach(() => apiFetch.mockReset());

  it("moves a dragged card through the revision-checked mutation and refreshes the board", async () => {
    setup();
    const card = await screen.findByTestId("card-readiness-canon_records-canon-4");
    expect(screen.getByTestId("note-readiness-planning-only")).toHaveTextContent("does not approve Canon Records");
    expect(screen.getByTestId("link-readiness-editor-canon_records-canon-4")).toHaveAttribute("href", record.href);

    const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card, { dataTransfer: transfer });
    const target = screen.getByTestId("lane-readiness-canon_records-review");
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/readiness-planning/canon_records/canon-4",
      { method: "PATCH", body: JSON.stringify({ world_id: "world-7", lane: "review", expected_revision: 3 }) },
    ));
    await waitFor(() => expect(screen.getByTestId("lane-readiness-canon_records-review")).toContainElement(
      screen.getByTestId("card-readiness-canon_records-canon-4"),
    ));
    await waitFor(() => expect(apiFetch.mock.calls.filter(([url]) => String(url).includes("?world_id=")).length).toBeGreaterThan(1));
  });

  it("keeps the lane selector available as a non-drag alternative", async () => {
    setup();
    const selector = await screen.findByTestId("select-readiness-lane-canon_records-canon-4");
    fireEvent.change(selector, { target: { value: "ready" } });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/readiness-planning/canon_records/canon-4",
      { method: "PATCH", body: JSON.stringify({ world_id: "world-7", lane: "ready", expected_revision: 3 }) },
    ));
    await waitFor(() => expect(screen.getByTestId("lane-readiness-canon_records-ready")).toContainElement(
      screen.getByTestId("card-readiness-canon_records-canon-4"),
    ));
  });
});