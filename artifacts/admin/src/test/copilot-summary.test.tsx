import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel } from "@/components/CopilotPanel";

const thread = [
  { id: 1, role: "user", content: "The archive should feel hidden beneath the village.", },
  { id: 2, role: "assistant", content: "Use narrow passages and botanical markings to hold that secret.", },
] as const;

function renderPanel(props: Partial<React.ComponentProps<typeof CopilotPanel>> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <CopilotPanel
        isOpen
        onClose={vi.fn()}
        activeFieldLabel="Wychcombe · 25 records"
        storageKey="copilot-summary-wychcombe"
        onSend={vi.fn().mockResolvedValue({ reply: "A new grounded thought." })}
        onSummarize={vi.fn().mockResolvedValue({
          summary: "Key ideas\n- The archive is hidden below the village.\n\nNext steps\n- Connect its markings to the botanical lore.",
        })}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("CopilotPanel conversation summaries", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("copilot-summary-wychcombe", JSON.stringify(thread));
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("creates reviewable notes, copies them, and marks them stale after a new turn", async () => {
    const onSummarize = vi.fn().mockResolvedValue({
      summary: "Key ideas\n- The archive is hidden below the village.\n\nNext steps\n- Connect its markings to the botanical lore.",
    });
    renderPanel({ onSummarize });

    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));

    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith([
      { role: "user", content: "The archive should feel hidden beneath the village." },
      { role: "assistant", content: "Use narrow passages and botanical markings to hold that secret." },
    ]));
    expect(await screen.findByText("Co-write notes")).toBeInTheDocument();
    expect(screen.getByText("Wychcombe · 25 records")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy notes" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("The archive is hidden")));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    fireEvent.change(screen.getByPlaceholderText("Ask about wychcombe · 25 records…"), {
      target: { value: "How should the entrance reveal itself?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("A new grounded thought.");

    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    expect(screen.getByText(/New messages have been added since these notes were created/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update summary" })).toBeInTheDocument();
  });

  it("shows a retryable refresh error alongside an existing summary and reports clipboard failures", async () => {
    sessionStorage.setItem("copilot-summary-wychcombe:summary", JSON.stringify({
      content: "Key ideas\n- The archive keeps the village's memories.",
      sourceTurnCount: 2,
      chatTurnCount: 2,
      sourceWasLimited: false,
      createdAt: Date.now(),
      contextLabel: "Wychcombe · 25 records",
    }));
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    renderPanel({ onSummarize: vi.fn().mockRejectedValue(new Error("AI unavailable")) });

    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t copy notes");

    fireEvent.click(screen.getByRole("button", { name: "Refresh summary" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some(alert =>
      alert.textContent?.replace(/\s+/g, " ").includes("Couldn't update notes."),
    )).toBe(true));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/The archive keeps the village's memories/)).toBeInTheDocument();
  });

  it("summarizes only the current bounded window and labels long-transcript provenance", async () => {
    const longThread = Array.from({ length: 24 }, (_, index) => ({
      id: index + 1,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn-${index}`,
    }));
    sessionStorage.setItem("copilot-summary-long", JSON.stringify(longThread));
    const onSummarize = vi.fn().mockResolvedValue({ summary: "Key ideas\n- Latest threads only." });

    renderPanel({ storageKey: "copilot-summary-long", onSummarize });
    fireEvent.click(screen.getByRole("button", { name: "Create summary" }));

    await waitFor(() => expect(onSummarize).toHaveBeenCalledWith(
      expect.arrayContaining([{ role: "user", content: "turn-4" }]),
    ));
    expect(onSummarize.mock.calls[0]![0]).toHaveLength(20);
    expect(await screen.findByText("Based on the latest 20 conversation turns")).toBeInTheDocument();
  });
});