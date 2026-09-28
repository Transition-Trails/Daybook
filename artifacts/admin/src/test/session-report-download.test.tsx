import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorldSmithSessionReports from "@/pages/super/WorldSmithSessionReports";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

const id = "12f0a064-c73b-4e5a-a65a-1c439a333aae";
const report = {
  id, authorUserId: "admin", clientId: "client",
  title: "Saved report", summary: "Saved summary",
  workDone: ["Saved action"], decisions: ["Saved decision"],
  openQuestions: ["Saved question"], nextSteps: ["Saved next step"],
  worldId: null, worldName: null, authorName: "Admin", clientName: "Client",
  createdAt: "2026-09-28T12:00:00.000Z",
};

async function openReport() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorldSmithSessionReports />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByTestId(`button-open-session-report-${id}`));
  return screen.findByTestId("button-download-session-report-markdown");
}

describe("admin session report Markdown download", () => {
  const click = vi.fn();
  const createObjectURL = vi.fn((_blob: Blob) => "blob:report");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(
      path.endsWith(`/${id}`) ? { report } : { reports: [report], total: 1 },
    ));
    click.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      click(this.download);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches with the session cookie and saves a named Markdown Blob", async () => {
    const markdown = "# Saved report\n\n**Summary:** Saved summary\n\n- Saved action";
    const fetchMock = vi.fn().mockResolvedValue(new Response(markdown, {
      status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(await openReport());
    await waitFor(() => expect(click).toHaveBeenCalledWith(`worldsmith-session-report-${id}.md`));
    expect(fetchMock).toHaveBeenCalledWith(`/api/worldsmith/session-reports/${id}/markdown`, {
      credentials: "include",
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    [new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { "Content-Type": "application/json" } }), "Your session has expired"],
    [new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } }), "did not return a Markdown report"],
  ])("shows an error without saving a response that is not a report", async (response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    fireEvent.click(await openReport());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});