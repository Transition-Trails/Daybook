import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorldSmithCompiler from "@/pages/super/WorldSmithCompiler";

const { apiFetchMock, toastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/lib/worldsmith/storage", () => ({
  worldsmithStorage: {
    compilerAutoPreview: () => null,
    setCompilerAutoPreview: vi.fn(),
  },
}));

function renderCompiler() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WorldSmithCompiler />
    </QueryClientProvider>,
  );
}

const validPageId = "43fb4f74-303e-4f3f-8fdb-aea9294ca3f4";
const correctedPageId = "53fb4f74-303e-4f3f-8fdb-aea9294ca3f4";

const resolvedPreflight = {
  spec_id: correctedPageId,
  production_specification: "The Glasswater Almanac",
  component_type: "Cover Art",
  component_specification: null,
  payload_version: "PP-2.0",
  canon_dependency: "None",
  compiled_prompt_status: "Not Compiled",
  generation_readiness: "Draft",
  version: "1",
  prompt_module_count: 0,
  canon_record_count: 0,
  world: "Glasswater",
  status: "Draft",
};

describe("WorldSmith compiler Notion page resolution", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    toastMock.mockReset();
  });

  it("shows a persistent actionable error and leaves the input usable after an unavailable page", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new Error("Production Specification page could not be resolved. Check that the page ID is correct and that the Notion integration has access."),
    ).mockResolvedValueOnce(resolvedPreflight);

    renderCompiler();
    const input = screen.getByLabelText("Production Specification");
    fireEvent.change(input, { target: { value: validPageId } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be resolved");
    expect(screen.getByRole("button", { name: "Resolve" })).toBeEnabled();
    expect(input).toHaveValue(validPageId);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not resolve spec" }));

    fireEvent.change(input, { target: { value: correctedPageId } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByText("Spec Resolved")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains malformed input before a request is made", async () => {
    renderCompiler();
    fireEvent.change(screen.getByLabelText("Production Specification"), {
      target: { value: "not-a-notion-page-id" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid Notion page URL");
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
    await waitFor(() => expect(apiFetchMock).not.toHaveBeenCalled());
  });
});