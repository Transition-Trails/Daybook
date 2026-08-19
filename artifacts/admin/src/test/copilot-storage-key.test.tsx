import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel } from "@/components/CopilotPanel";

const firstThread = [{ id: 11, role: "user", content: "First world conversation" }];
const secondThread = [{ id: 21, role: "assistant", content: "Second world conversation" }];

function renderPanel(storageKey: string) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <CopilotPanel
        isOpen
        onClose={() => undefined}
        activeFieldLabel="World narrative"
        storageKey={storageKey}
        onSend={async () => ({ reply: "Unused in this test" })}
      />
    </QueryClientProvider>
  );
}

describe("CopilotPanel storage-key isolation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
  });

  it("loads the new entity thread without overwriting either saved conversation", () => {
    sessionStorage.setItem("copilot-first-world", JSON.stringify(firstThread));
    sessionStorage.setItem("copilot-second-world", JSON.stringify(secondThread));

    const { rerender } = render(renderPanel("copilot-first-world"));
    expect(screen.getByText("First world conversation")).toBeInTheDocument();
    expect(screen.queryByText("Second world conversation")).not.toBeInTheDocument();

    rerender(renderPanel("copilot-second-world"));

    expect(screen.queryByText("First world conversation")).not.toBeInTheDocument();
    expect(screen.getByText("Second world conversation")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("copilot-first-world")!)).toEqual(firstThread);
    expect(JSON.parse(sessionStorage.getItem("copilot-second-world")!)).toEqual(secondThread);
  });
});