import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, location, search } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  location: { value: "/super/worldsmith/editorial/bible" },
  search: { value: "" },
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("wouter", () => ({
  useLocation: () => [location.value, vi.fn()],
  useSearch: () => search.value,
}));

import { EditorialProvider, useEditorial } from "@/contexts/EditorialContext";

function Selection() {
  const { selectedWorldId, setSelectedWorldId } = useEditorial();
  return (
    <div>
      <span data-testid="selected-world">{selectedWorldId}</span>
      <button onClick={() => setSelectedWorldId("world-b")}>Choose B</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <EditorialProvider>
      <Selection />
    </EditorialProvider>,
  );
}

describe("EditorialContext world deep links", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    location.value = "/super/worldsmith/editorial/bible";
    search.value = "";
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/worlds") {
        return Promise.resolve({ worlds: [
          { id: "world-a", name: "World A", code: "A", status: "active" },
          { id: "world-b", name: "World B", code: "B", status: "active" },
        ] });
      }
      return Promise.resolve({ collections: [] });
    });
  });

  it("uses a valid URL world instead of the stored world", async () => {
    localStorage.setItem("daybook:worldsmith:v1:selected-world", "world-a");
    search.value = "?world_id=world-b";

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("selected-world")).toHaveTextContent("world-b"));
    await waitFor(() => expect(localStorage.getItem("daybook:worldsmith:v1:selected-world")).toBe("world-b"));
  });

  it.each([
    "/super/worldsmith/editorial/connections",
    "/super/worldsmith/editorial/stories",
    "/super/worldsmith/editorial/stories/new",
    "/super/worldsmith/editorial/stories/story-1",
  ])("accepts world deep links on %s", async path => {
    location.value = path;
    search.value = "?world_id=world-b";

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("selected-world")).toHaveTextContent("world-b"));
  });

  it("rejects an unknown URL world and retains the valid stored world", async () => {
    localStorage.setItem("daybook:worldsmith:v1:selected-world", "world-a");
    search.value = "?world_id=unknown";

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("selected-world")).toHaveTextContent("world-a"));
  });

  it("does not apply a world_id on unrelated routes or replace a later user choice", async () => {
    localStorage.setItem("daybook:worldsmith:v1:selected-world", "world-a");
    location.value = "/super/worldsmith";
    search.value = "?world_id=world-b";
    const view = renderProvider();

    await waitFor(() => expect(screen.getByTestId("selected-world")).toHaveTextContent("world-a"));
    fireEvent.click(screen.getByRole("button", { name: "Choose B" }));
    expect(screen.getByTestId("selected-world")).toHaveTextContent("world-b");

    location.value = "/super/worldsmith/compiler";
    search.value = "?world_id=world-a";
    view.rerender(<EditorialProvider><Selection /></EditorialProvider>);
    expect(screen.getByTestId("selected-world")).toHaveTextContent("world-b");
  });
});