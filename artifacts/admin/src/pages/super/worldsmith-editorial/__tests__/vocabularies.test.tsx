import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Vocabularies from "../Vocabularies";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
let selectedWorldId: string | null = "world-1";
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId,
    selectedWorld: selectedWorldId ? { id: selectedWorldId, name: "Wychcombe" } : null,
    worldsLoading: false,
  }),
}));

const response = {
  vocabularies: [
    { id: "v-world", key: "canon_type", label: "Canon type", description: "Kinds of record", scope: "world", worldId: "world-1", active: true, version: 4 },
    { id: "v-global", key: "era", label: "Era", description: null, scope: "global", worldId: null, active: true, version: 2 },
  ],
  options: [
    { id: "o-world", vocabularyId: "v-world", key: "person", label: "Person", description: null, worldId: "world-1", active: true, version: 3, displayOrder: 1 },
    { id: "o-global", vocabularyId: "v-global", key: "regency", label: "Regency", description: null, worldId: null, active: false, version: 1, displayOrder: 0 },
  ],
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><Vocabularies /></QueryClientProvider>) };
}

describe("editorial vocabulary management", () => {
  beforeEach(() => {
    selectedWorldId = "world-1";
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation(async (path, init) =>
      path.includes("vocabularies?") ? response as never : init?.method === "PATCH" ? { option: response.options[0] } as never : { vocabulary: response.vocabularies[0] } as never);
  });

  it("shows inherited global terms as read-only alongside world terms and their exact keys", async () => {
    setup();
    await screen.findByTestId("button-expand-vocabulary-v-global");
    fireEvent.click(screen.getByTestId("button-expand-vocabulary-v-global"));
    fireEvent.click(screen.getByTestId("button-expand-vocabulary-v-world"));
    expect(await screen.findByTestId("text-key-o-global")).toHaveTextContent("regency");
    expect(screen.getByTestId("row-options-o-global")).toHaveTextContent("Inherited global · read only");
    expect(screen.getByTestId("row-options-o-global")).toHaveTextContent("Inactive");
    expect(screen.queryByTestId("button-edit-o-global")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-add-option-v-global")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-vocabulary-v-global")).toHaveTextContent("choices are read only here");
    expect(screen.getByTestId("text-key-o-world")).toHaveTextContent("person");
  });

  it("creates a world choice with the saved key and parent vocabulary id", async () => {
    setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    await screen.findByTestId("row-options-o-world");
    fireEvent.click(screen.getByTestId("button-add-option-v-world"));
    fireEvent.change(screen.getByTestId("input-vocabulary-key"), { target: { value: "  edwardian  " } });
    fireEvent.change(screen.getByTestId("input-vocabulary-label"), { target: { value: "Edwardian" } });
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/options",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ world_id: "world-1", vocabulary_id: "v-world", key: "edwardian", label: "Edwardian" }) }),
    ));
  });

  it("shows effective unavailability without changing the child's own active toggle", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => ({
      ...response,
      vocabularies: [{ ...response.vocabularies[0], active: false }],
      options: [response.options[0]],
    }) as never);
    setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    const row = await screen.findByTestId("row-options-o-world");
    expect(row).toHaveTextContent("Unavailable");
    expect(row).toHaveTextContent("Choice is active, but unavailable while its vocabulary is inactive.");
    expect(screen.getByTestId("button-toggle-o-world")).toHaveTextContent("Deactivate");
    fireEvent.click(screen.getByTestId("button-toggle-o-world"));
    fireEvent.click(screen.getByTestId("button-confirm-toggle"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/options/o-world",
      expect.objectContaining({ body: JSON.stringify({ world_id: "world-1", expected_version: 3, active: false }) }),
    ));
  });

  it("requires confirmation before deactivation and sends the expected version", async () => {
    setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    await screen.findByTestId("row-options-o-world");
    fireEvent.click(screen.getByTestId("button-toggle-o-world"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("disallows future metadata saves");
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByTestId("button-confirm-toggle"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/options/o-world",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ world_id: "world-1", expected_version: 3, active: false }) }),
    ));
  });

  it("does not silently overwrite a version conflict", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path.includes("vocabularies?")) return response as never;
      if (init?.method === "PATCH") throw Object.assign(new Error("Version mismatch"), { status: 409 });
      return {} as never;
    });
    setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    await screen.findByTestId("row-options-o-world");
    fireEvent.click(screen.getByTestId("button-edit-o-world"));
    expect(screen.getByTestId("input-vocabulary-key")).toBeDisabled();
    fireEvent.change(screen.getByTestId("input-vocabulary-label"), { target: { value: "People" } });
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    expect(await screen.findByTestId("status-vocabulary-notice")).toHaveTextContent("your change was not saved");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for a world rather than requesting an unscoped list", () => {
    selectedWorldId = null;
    setup();
    expect(screen.getByTestId("status-no-world")).toHaveTextContent("Choose a world");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("does not show a completed save from the old world after switching mid-save", async () => {
    let completeSave!: (value: unknown) => void;
    const pendingSave = new Promise(resolve => { completeSave = resolve; });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path.includes("vocabularies?")) return response as never;
      if (init?.method === "POST") return pendingSave as never;
      return {} as never;
    });
    const view = setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    await screen.findByTestId("row-options-o-world");
    fireEvent.click(screen.getByTestId("button-add-vocabulary"));
    fireEvent.change(screen.getByTestId("select-new-vocabulary-record-type"), { target: { value: "lore" } });
    fireEvent.change(screen.getByTestId("select-new-vocabulary-field"), { target: { value: "lore_type" } });
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/vocabularies", expect.objectContaining({ method: "POST" }),
    ));
    selectedWorldId = "world-2";
    view.rerender(<QueryClientProvider client={view.client}><Vocabularies /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => { completeSave({ vocabulary: response.vocabularies[0] }); await pendingSave; });
    expect(screen.queryByTestId("status-vocabulary-notice")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/vocabularies?world_id=world-2");
  });

  it("does not show a stale conflict from another world after switching during a toggle", async () => {
    let failSave!: (reason: unknown) => void;
    const pendingSave = new Promise((_resolve, reject) => { failSave = reject; });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path.includes("vocabularies?")) return response as never;
      if (init?.method === "PATCH") return pendingSave as never;
      return {} as never;
    });
    const view = setup();
    fireEvent.click(await screen.findByTestId("button-expand-vocabulary-v-world"));
    await screen.findByTestId("row-options-o-world");
    fireEvent.click(screen.getByTestId("button-toggle-o-world"));
    fireEvent.click(screen.getByTestId("button-confirm-toggle"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/options/o-world", expect.objectContaining({ method: "PATCH" }),
    ));
    selectedWorldId = "world-2";
    view.rerender(<QueryClientProvider client={view.client}><Vocabularies /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await act(async () => { failSave(Object.assign(new Error("Conflict"), { status: 409 })); try { await pendingSave; } catch { /* mutation handles it */ } });
    expect(screen.queryByTestId("status-vocabulary-notice")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the invoking action", async () => {
    const user = userEvent.setup();
    setup();
    const trigger = await screen.findByTestId("button-add-vocabulary");
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("starts collapsed, toggles choices, and opens matching choices during search", async () => {
    setup();
    const toggle = await screen.findByTestId("button-expand-vocabulary-v-world");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("row-options-o-world")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-add-option-v-world")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("row-options-o-world")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("row-options-o-world")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-search-vocabularies"), { target: { value: "person" } });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("row-options-o-world")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("row-options-o-world")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-search-vocabularies"), { target: { value: "" } });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("filters the register by record type and fills the field key automatically", async () => {
    const fixtures = {
      ...response,
      vocabularies: [
        ...response.vocabularies,
        { id: "v-object", key: "object_class", label: "Object Class", description: "", scope: "world", worldId: "world-1", active: true, version: 1 },
        { id: "v-shared", key: "canon_stability", label: "Canon Stability", description: "", scope: "world", worldId: "world-1", active: true, version: 1 },
        { id: "v-character", key: "life_stage", label: "Life Stage", description: "", scope: "world", worldId: "world-1", active: true, version: 1 },
      ],
    };
    vi.mocked(apiFetch).mockImplementation(async (path) => path.includes("vocabularies?") ? fixtures as never : { vocabulary: { id: "new-vocab" } } as never);
    setup();
    await screen.findByTestId("section-vocabulary-v-object");
    fireEvent.change(screen.getByTestId("select-vocabulary-record-type"), { target: { value: "object" } });
    expect(screen.getByTestId("section-vocabulary-v-object")).toBeInTheDocument();
    expect(screen.getByTestId("section-vocabulary-v-shared")).toBeInTheDocument();
    expect(screen.queryByTestId("section-vocabulary-v-character")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-add-vocabulary"));
    expect(screen.getByTestId("select-new-vocabulary-record-type")).toHaveValue("object");
    expect(screen.queryByTestId("input-vocabulary-key")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("select-new-vocabulary-field"), { target: { value: "material" } });
    expect(screen.getByTestId("input-vocabulary-key")).toHaveValue("material");
    expect(screen.getByTestId("input-vocabulary-key")).toHaveAttribute("readonly");
    expect(screen.getByTestId("input-vocabulary-label")).toHaveValue("Material");
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/vocabularies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ world_id: "world-1", key: "material", label: "Material" }),
      }),
    ));
  });

  it("prevents a second vocabulary for an already configured field", async () => {
    const fixtures = {
      ...response,
      vocabularies: [
        ...response.vocabularies,
        { id: "v-character", key: "life_stage", label: "Life Stage", description: "", scope: "world", worldId: "world-1", active: true, version: 1 },
      ],
    };
    vi.mocked(apiFetch).mockImplementation(async () => fixtures as never);
    setup();
    fireEvent.click(await screen.findByTestId("button-add-vocabulary"));
    fireEvent.change(screen.getByTestId("select-new-vocabulary-record-type"), { target: { value: "character" } });
    fireEvent.change(screen.getByTestId("select-new-vocabulary-field"), { target: { value: "life_stage" } });
    expect(screen.getByTestId("button-open-existing-vocabulary")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    expect(screen.getByTestId("status-vocabulary-form-error")).toHaveTextContent("already has a vocabulary");
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByTestId("button-open-existing-vocabulary"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("select-vocabulary-record-type")).toHaveValue("character");
    expect(screen.getByTestId("button-expand-vocabulary-v-character")).toHaveAttribute("aria-expanded", "true");
  });
});