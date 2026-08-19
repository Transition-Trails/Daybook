import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditorialCopilot } from "@/components/EditorialCopilot";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

function renderCopilot(overrides: Partial<React.ComponentProps<typeof EditorialCopilot>> = {}) {
  const onApply = vi.fn();
  const props: React.ComponentProps<typeof EditorialCopilot> = {
    isOpen: true,
    onClose: vi.fn(),
    surface: "spec",
    worldId: "world-1",
    storageKey: "editorial-copilot-test",
    title: "Test copilot",
    greeting: "Ready to help.",
    activeTarget: { key: "designIntent", label: "Design Intent" },
    context: { draft: { designIntent: "Current intent" }, section: "Creative Direction" },
    onApply,
    ...overrides,
  };
  const result = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <EditorialCopilot {...props} />
    </QueryClientProvider>,
  );
  return { ...result, props, onApply };
}

describe("EditorialCopilot", () => {
  beforeEach(() => {
    sessionStorage.clear();
    apiFetchMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
  });

  it("sends a surface-specific draft context and applies to the immutable target captured at send time", async () => {
    let resolveReply: ((value: { reply: string }) => void) | undefined;
    apiFetchMock.mockImplementation(() => new Promise(resolve => { resolveReply = resolve; }));
    const { rerender, props, onApply } = renderCopilot();

    fireEvent.change(screen.getByPlaceholderText("Ask about design intent…"), {
      target: { value: "Make this more specific." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/worldsmith/copilot", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"surface":"spec"'),
    }));
    const request = JSON.parse(apiFetchMock.mock.calls[0]![1].body);
    expect(request).toMatchObject({
      surface: "spec",
      worldId: "world-1",
      field: "designIntent",
      fieldLabel: "Design Intent",
      context: props.context,
    });

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <EditorialCopilot {...props} activeTarget={{ key: "reviewCriteria", label: "Review Criteria" }} onApply={onApply} />
      </QueryClientProvider>,
    );
    resolveReply?.({ reply: "Finished field copy." });

    const apply = await screen.findByRole("button", { name: /Apply to Design Intent/i });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith("Finished field copy.", "designIntent", "Design Intent");
  });

  it.each([
    ["style_guide", { draft: { content: "Rules" }, guideName: "Visual language" }],
    ["prompt_module", { draft: { primaryContent: "Prompt" }, section: "Prompt Content" }],
  ] as const)("sends the %s surface without sharing another surface's context", async (surface, context) => {
    apiFetchMock.mockResolvedValue({ reply: "A focused answer." });
    renderCopilot({
      surface,
      storageKey: `editorial-copilot-${surface}`,
      context,
      activeTarget: { key: "content", label: "Content" },
    });

    fireEvent.change(screen.getByPlaceholderText("Ask about content…"), { target: { value: "Draft this." } });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const request = JSON.parse(apiFetchMock.mock.calls[0]![1].body);
    expect(request.surface).toBe(surface);
    expect(request.context).toEqual(context);
  });
});