import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiFetch, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch,
  storageApi: {},
  storesApi: { flags: { get: vi.fn() } },
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));
vi.mock("@/components/PaletteLibraryPicker", () => ({
  PaletteLibraryPicker: () => null,
  paletteReferenceText: () => "",
}));
vi.mock("@/components/FontLibraryPicker", () => ({
  FontLibraryPicker: ({ onChange }: { onChange: (choices: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() => onChange([{
        fontId: "font-lora",
        family: "Lora",
        roles: [{ role: "heading", weight: "700" }],
      }])}
    >
      Select sample font
    </button>
  ),
}));

import {
  BibleRichTextField,
  BibleSection,
  openWorldBibleEditor,
  WorldBibleSection,
} from "@/pages/super/WorldSmithHome";

describe("World Bible editor building blocks", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.mockReset();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("keeps World Rules visible but read-only for staff and saves prose or typography without them", async () => {
    apiFetch.mockResolvedValue({
      id: "world-42",
      name: "Thornvale",
      typography: [{ fontId: "font-lora", family: "Lora", roles: [{ role: "heading", weight: "700" }] }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <WorldBibleSection
          world={{
            id: "world-42",
            name: "Thornvale",
            visualPalette: "Candlelit rooms",
            proseVoice: null,
            atmosphericNotes: null,
            materialWorld: null,
            worldRules: ["No modern objects"],
            typography: [],
          }}
          showCopilot={false}
          canEditWorldRules={false}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "World Rules are read-only for store staff",
    );
    expect(screen.getByText("No modern objects")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove rule/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Add a rule…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select sample font" }));
    fireEvent.click(screen.getByRole("button", { name: "Save World Bible" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/worldsmith/worlds/world-42",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const [, request] = apiFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body).not.toHaveProperty("worldRules");
    expect(body.typography).toEqual([{
      fontId: "font-lora",
      family: "Lora",
      roles: [{ role: "heading", weight: "700" }],
    }]);
  });

  it("shows World Rule controls for store owners", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <WorldBibleSection
          world={{
            id: "world-42",
            name: "Thornvale",
            visualPalette: null,
            proseVoice: null,
            atmosphericNotes: null,
            materialWorld: null,
            worldRules: ["No modern objects"],
            typography: [],
          }}
          showCopilot={false}
          canEditWorldRules
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Remove rule 1" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a rule…")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("routes the overview World Bible edit action to the editorial Bible studio", () => {
    const navigate = vi.fn();

    openWorldBibleEditor("world-42", navigate);

    expect(localStorage.getItem("daybook:worldsmith:v1:selected-world")).toBe("world-42");
    expect(navigate).toHaveBeenCalledWith("/super/worldsmith/editorial/bible");
  });

  it("keeps a Bible section accessible when collapsed and reopened", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <BibleSection
        title="Visual Palette"
        question="What does this world look like?"
        hint="Colours, lighting, and textures"
        open={false}
        onToggle={onToggle}
        preview="Moss green and candlelight"
      >
        <p>Editor content</p>
      </BibleSection>,
    );

    const toggle = screen.getByRole("button", { name: /what does this world look like/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Editor content")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <BibleSection
        title="Visual Palette"
        question="What does this world look like?"
        hint="Colours, lighting, and textures"
        open
        onToggle={onToggle}
        preview="Moss green and candlelight"
      >
        <p>Editor content</p>
      </BibleSection>,
    );

    expect(screen.getByRole("button", { name: /what does this world look like/i }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Editor content")).toBeInTheDocument();
  });

  it("offers formatting controls and returns edited rich text", () => {
    const onChange = vi.fn();
    render(
      <BibleRichTextField
        value="Candlelit rooms"
        placeholder="Visual Palette…"
        active={false}
        onFocus={vi.fn()}
        onChange={onChange}
      />,
    );

    for (const label of [
      "Bold", "Italic", "Underline", "Heading", "Small heading",
      "Bulleted list", "Numbered list", "Quote", "Clear formatting",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    const editor = screen.getByRole("textbox");
    editor.innerHTML = "<p><strong>Candlelit rooms</strong></p>";
    fireEvent.input(editor);
    expect(onChange).toHaveBeenLastCalledWith("<p><strong>Candlelit rooms</strong></p>");

    fireEvent.mouseDown(screen.getByRole("button", { name: "Bold" }));
    expect(document.execCommand).toHaveBeenCalledWith("bold", false, undefined);
  });
});