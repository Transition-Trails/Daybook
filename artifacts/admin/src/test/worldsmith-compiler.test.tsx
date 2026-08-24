import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("distinguishes a valid page without integration access from a mistyped page ID", async () => {
    const accessError = Object.assign(
      new Error("The Production Specification page exists, but the WorldSmith Notion integration cannot access it."),
      { code: "SPEC_ACCESS_DENIED", status: 403 },
    );
    apiFetchMock.mockRejectedValueOnce(accessError);

    renderCompiler();
    fireEvent.change(screen.getByLabelText("Production Specification"), {
      target: { value: validPageId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The page ID is valid");
    expect(alert).toHaveTextContent("invite the WorldSmith integration");
    expect(alert).toHaveTextContent("Open WorldSmith settings");
    expect(alert).toHaveTextContent("Notion sharing help");
    expect(screen.getByRole("link", { name: /Open this page in Notion/i })).toHaveAttribute(
      "href",
      `https://www.notion.so/${validPageId.replace(/-/g, "")}`,
    );
  });

  it("shows a completed final-art package without a duplicate-generation action", async () => {
    const previewSuccess = {
      status: "success",
      production_item: "The Glasswater Almanac",
      spec_page_id: correctedPageId,
      notion_page_id: correctedPageId,
      notion_page_url: `https://www.notion.so/${correctedPageId.replaceAll("-", "")}`,
      preview_filename: "Glasswater-spec-board.png",
      provider: "OpenAI",
      model: "gpt-image-2",
      prompt_hash: "prompt-hash",
      upload_status: "success",
    };
    const compileSuccess = {
      status: "compiled",
      run_id: "run-1",
      production_spec_id: correctedPageId,
      payload_version: "PP-2.0",
      compiled_prompt_status: "Compiled",
      prompt_hash: "prompt-hash",
      compiled_prompt: "A quiet glasswater cover.",
      warnings: [],
      provenance: { world: "Glasswater", payload_format: "2.0" },
    };
    const completedPackage = {
      ...compileSuccess,
      production_package: {
        id: "package-1",
        status: "success",
        production_art_status: "artwork_review",
        idempotent: false,
        filename: "WS-GLASSWATER-HERO-MASTER.png",
        visual_asset_id: "6f62d5b2-7656-4c55-b0a9-8ce37f3ac7de",
        notion_upload_id: "upload-1",
        provider: "OpenAI",
        model: "gpt-image-2",
        model_version: "2026-01",
        effective_size: "1440x1440",
        quality: "medium",
        target: {
          dpi: 150,
          print_width_in: 12,
          print_height_in: 12,
          orientation: "square",
        },
        estimated_cost_usd: 0.19,
      },
    };

    apiFetchMock
      .mockResolvedValueOnce({ ...resolvedPreflight, status: "Approved" })
      .mockResolvedValueOnce(previewSuccess);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(compileSuccess), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completedPackage), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderCompiler();
    fireEvent.change(screen.getByLabelText("Production Specification"), { target: { value: correctedPageId } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await screen.findByText("Spec Resolved");
    fireEvent.click(screen.getByRole("button", { name: "Compile" }));

    expect(await screen.findByText("Final Artwork Package")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Request Final Artwork" }));

    expect(await screen.findByRole("link", { name: "Open Final Visual Asset in Notion" })).toHaveAttribute(
      "href",
      "https://www.notion.so/6f62d5b276564c55b0a98ce37f3ac7de",
    );
    expect(screen.getByText("1440x1440 px · 12×12 in · 150 dpi")).toBeVisible();
    expect(screen.getByText("OpenAI · gpt-image-2 (2026-01)")).toBeVisible();
    expect(screen.getByText("$0.19 projected")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request Final Artwork" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/production-packages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps rate-limit failures focused on retrying instead of page sharing", async () => {
    const rateLimited = Object.assign(
      new Error("Notion rate limit hit. Wait a moment and try again."),
      { code: "NOTION_RATE_LIMITED", status: 429 },
    );
    apiFetchMock.mockRejectedValueOnce(rateLimited);

    renderCompiler();
    fireEvent.change(screen.getByLabelText("Production Specification"), {
      target: { value: validPageId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Notion rate limit hit");
    expect(alert).not.toHaveTextContent("Restore Notion access");
    expect(screen.queryByRole("link", { name: /Notion sharing help/i })).not.toBeInTheDocument();
  });
});