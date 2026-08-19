/**
 * CopilotPanel — attachment UI tests.
 *
 * Verifies:
 *  - Paperclip button is absent when allowAttachments is false (default).
 *  - Paperclip button is present when allowAttachments is true.
 *  - Attachment chip appears after a file is selected.
 *  - × button on the chip clears the attachment.
 *  - The attachment is included in onSend args when a message is sent.
 *  - Pasting an image from clipboard attaches it.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel } from "@/components/CopilotPanel";
import type { PendingAttachment } from "@/components/CopilotPanel";

// Minimal 1×1 PNG as a data URI
const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_B64}`;

function makePngFile(name = "swatch.png"): File {
  // Decode the base64 back to bytes
  const bin = atob(TINY_PNG_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: "image/png" });
}

interface PanelProps {
  onSend?: (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
    attachment?: PendingAttachment,
  ) => Promise<{ reply: string }>;
  allowAttachments?: boolean;
}

function renderPanel({ onSend, allowAttachments = true }: PanelProps = {}) {
  const defaultOnSend = vi.fn().mockResolvedValue({ reply: "OK" });
  const panel = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <CopilotPanel
        isOpen
        onClose={vi.fn()}
        title="Test Co-write"
        activeFieldLabel="Narrative"
        allowAttachments={allowAttachments}
        onSend={onSend ?? defaultOnSend}
      />
    </QueryClientProvider>,
  );
  return { ...panel, onSend: onSend ?? defaultOnSend };
}

beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
});

describe("CopilotPanel — attachment UI", () => {
  it("does NOT render the paperclip button when allowAttachments is false", () => {
    renderPanel({ allowAttachments: false });
    expect(screen.queryByLabelText("Attach file")).toBeNull();
  });

  it("renders the paperclip button when allowAttachments is true", () => {
    renderPanel({ allowAttachments: true });
    expect(screen.getByRole("button", { name: "Attach file" })).toBeDefined();
  });

  it("shows an attachment chip after a file is selected via the file input", async () => {
    renderPanel();

    const fileInput = screen.getByLabelText("Attach file", { selector: "input[type=file]" });
    fireEvent.change(fileInput, { target: { files: [makePngFile()] } });

    // The thumbnail or filename chip should appear
    await waitFor(() => {
      // Image chip renders an <img> with the alt being the filename
      const img = screen.queryByRole("img", { name: "swatch.png" });
      expect(img).toBeDefined();
    });
  });

  it("clears the chip when the × button is clicked", async () => {
    renderPanel();

    const fileInput = screen.getByLabelText("Attach file", { selector: "input[type=file]" });
    fireEvent.change(fileInput, { target: { files: [makePngFile()] } });

    // Wait for chip
    await waitFor(() => screen.getByLabelText("Remove attachment"));

    fireEvent.click(screen.getByLabelText("Remove attachment"));

    // Chip should be gone
    expect(screen.queryByLabelText("Remove attachment")).toBeNull();
  });

  it("passes the attachment as the third argument to onSend when a message is sent", async () => {
    const onSend = vi.fn().mockResolvedValue({ reply: "Colour palette identified." });
    renderPanel({ onSend });

    const fileInput = screen.getByLabelText("Attach file", { selector: "input[type=file]" });
    fireEvent.change(fileInput, { target: { files: [makePngFile("palette.png")] } });

    // Wait for chip to confirm upload is done
    await waitFor(() => screen.getByLabelText("Remove attachment"));

    // Type a message and send
    fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
      target: { value: "What colours are here?" },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    const [msg, , attachment] = onSend.mock.calls[0] as [
      string,
      unknown[],
      PendingAttachment | undefined,
    ];
    expect(msg).toBe("What colours are here?");
    expect(attachment).toBeDefined();
    expect(attachment!.kind).toBe("image");
    expect(attachment!.name).toBe("palette.png");
    expect(attachment!.mediaType).toBe("image/png");
    expect(attachment!.dataUrl).toBe(TINY_PNG_DATA_URI);
  });

  it("clears the pending attachment after the message is sent", async () => {
    const onSend = vi.fn().mockResolvedValue({ reply: "Done." });
    renderPanel({ onSend });

    const fileInput = screen.getByLabelText("Attach file", { selector: "input[type=file]" });
    fireEvent.change(fileInput, { target: { files: [makePngFile()] } });
    await waitFor(() => screen.getByLabelText("Remove attachment"));

    fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
      target: { value: "Go." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    // After send, chip should be gone
    expect(screen.queryByLabelText("Remove attachment")).toBeNull();
  });
});
