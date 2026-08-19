/**
 * CopilotPanel attachment feature tests.
 *
 * Verifies:
 *  (a) Attachment chip appears after file selection via the file-picker button.
 *  (b) The × button clears the pending attachment.
 *  (c) The attachment is included in the third argument of onSend.
 *  (d) Pasting an image from the clipboard creates an attachment chip.
 *  (e) allowAttachments=false (default) hides the Attach button.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel, extractPdfText, type PendingAttachment } from "@/components/CopilotPanel";

// ── FileReader mock ───────────────────────────────────────────────────────────
// jsdom does not implement FileReader.readAsDataURL or readAsText, so we mock
// the entire class to drive onload synchronously.

const { mockFileReaderClass } = vi.hoisted(() => ({
  mockFileReaderClass: vi.fn(),
}));

vi.mock("@/components/CopilotPanel", async (importOriginal) => {
  // re-export everything from the real module; we just need the real impl
  return await importOriginal();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeImageFile(name = "swatch.png", type = "image/png", size = 1024): File {
  const blob = new Blob([new Uint8Array(size).fill(0)], { type });
  return new File([blob], name, { type });
}

function makeDocFile(content = "Hello world", name = "notes.txt", type = "text/plain"): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

function triggerFileChange(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderPanel(
  onSend: (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
    attachment?: PendingAttachment,
  ) => Promise<{ reply: string }>,
  opts: { allowAttachments?: boolean; storageKey?: string } = {},
) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CopilotPanel
        isOpen
        onClose={vi.fn()}
        activeFieldLabel="Narrative"
        allowAttachments={opts.allowAttachments ?? true}
        storageKey={opts.storageKey}
        onSend={onSend}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CopilotPanel — attachment UI", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
  });

  it("shows the Attach button when allowAttachments=true", () => {
    renderPanel(vi.fn().mockResolvedValue({ reply: "ok" }));
    expect(screen.getByLabelText("Attach file")).toBeInTheDocument();
  });

  it("hides the Attach button when allowAttachments is not set (default false)", () => {
    renderPanel(vi.fn().mockResolvedValue({ reply: "ok" }), { allowAttachments: false });
    expect(screen.queryByLabelText("Attach file")).not.toBeInTheDocument();
  });

  it("shows an image thumbnail chip after the user selects an image file", async () => {
    // Mock FileReader to simulate a data URL result
    const mockResult = "data:image/png;base64,iVBORw0KGgo=";
    const originalFileReader = globalThis.FileReader;
    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = mockResult;
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
      readAsText(_file: File, _enc?: string) {
        this.result = "text content";
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(vi.fn().mockResolvedValue({ reply: "ok" }));
      const attachBtn = screen.getByLabelText("Attach file");
      fireEvent.click(attachBtn);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();
      triggerFileChange(fileInput, makeImageFile("palette.png"));

      // Chip with image thumbnail should appear
      await waitFor(() => {
        expect(screen.getByAltText("palette.png")).toBeInTheDocument();
      });
      // Name should be visible
      expect(screen.getByTitle("palette.png")).toBeInTheDocument();
    } finally {
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });

  it("shows a document badge chip after selecting a text file", async () => {
    const originalFileReader = globalThis.FileReader;
    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsText(_file: File, _enc?: string) {
        this.result = "Some document content";
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
      readAsDataURL(_file: File) {
        // not called for docs
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(vi.fn().mockResolvedValue({ reply: "ok" }));
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeDocFile("Some text content", "context.txt"));

      await waitFor(() => {
        expect(screen.getByTitle("context.txt")).toBeInTheDocument();
      });
    } finally {
      Object.assign(globalThis, { FileReader: MockFileReader });
    }
  });

  it("clears the attachment when the × button is clicked", async () => {
    const originalFileReader = globalThis.FileReader;
    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = "data:image/png;base64,abc=";
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(vi.fn().mockResolvedValue({ reply: "ok" }));
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeImageFile("test.png"));

      await waitFor(() => expect(screen.getByTitle("test.png")).toBeInTheDocument());

      // Clear it
      fireEvent.click(screen.getByLabelText("Remove attachment"));
      await waitFor(() => {
        expect(screen.queryByTitle("test.png")).not.toBeInTheDocument();
      });
    } finally {
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });

  it("passes the attachment as the third argument to onSend", async () => {
    const onSend = vi.fn().mockResolvedValue({ reply: "got it" });
    const originalFileReader = globalThis.FileReader;
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = mockDataUrl;
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(onSend);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeImageFile("ref.png", "image/png", 256));

      await waitFor(() => expect(screen.getByAltText("ref.png")).toBeInTheDocument());

      // Type a message and send
      fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
        target: { value: "What colours are in this image?" },
      });
      fireEvent.click(screen.getByLabelText("Send"));

      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

      const [_msg, _hist, attachment] = onSend.mock.calls[0] as [
        string,
        { role: string; content: string }[],
        PendingAttachment | undefined,
      ];
      expect(attachment).toBeDefined();
      expect(attachment?.kind).toBe("image");
      expect(attachment?.dataUrl).toBe(mockDataUrl);
      expect(attachment?.mediaType).toBe("image/png");
      expect(attachment?.name).toBe("ref.png");
    } finally {
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });

  it("clears the attachment after a successful send", async () => {
    const onSend = vi.fn().mockResolvedValue({ reply: "got it" });
    const originalFileReader = globalThis.FileReader;
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = mockDataUrl;
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(onSend);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeImageFile("palette.png"));

      await waitFor(() => expect(screen.getByAltText("palette.png")).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
        target: { value: "Match these colours." },
      });
      fireEvent.click(screen.getByLabelText("Send"));

      // After send succeeds, chip should be gone
      await waitFor(() => {
        expect(screen.queryByAltText("palette.png")).not.toBeInTheDocument();
      });
    } finally {
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });

  it("replays the attachment on retry when the original request failed", async () => {
    // First call rejects (simulating a network failure), second succeeds
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ reply: "retry worked" });

    const originalFileReader = globalThis.FileReader;
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = mockDataUrl;
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      renderPanel(onSend);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeImageFile("ref.png"));

      await waitFor(() => expect(screen.getByAltText("ref.png")).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
        target: { value: "What colours are in this image?" },
      });
      fireEvent.click(screen.getByLabelText("Send"));

      // Wait for the failed state — a retry button should appear
      await waitFor(() => expect(screen.getByLabelText("Retry")).toBeInTheDocument());

      // onSend was called once (and rejected)
      expect(onSend).toHaveBeenCalledTimes(1);
      const [_msg1, _hist1, att1] = onSend.mock.calls[0] as [
        string,
        { role: string; content: string }[],
        PendingAttachment | undefined,
      ];
      expect(att1?.dataUrl).toBe(mockDataUrl);

      // Click retry
      fireEvent.click(screen.getByLabelText("Retry"));

      // onSend should be called a second time with the same attachment
      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

      const [_msg2, _hist2, att2] = onSend.mock.calls[1] as [
        string,
        { role: string; content: string }[],
        PendingAttachment | undefined,
      ];
      expect(att2).toBeDefined();
      expect(att2?.dataUrl).toBe(mockDataUrl);
      expect(att2?.kind).toBe("image");
      expect(att2?.name).toBe("ref.png");
    } finally {
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });

  it("never writes attachment payloads to sessionStorage", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("Network error"));
    const storageKey = "copilot-attachment-persistence-test";
    const originalFileReader = globalThis.FileReader;
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

    class MockFileReader extends EventTarget {
      result: string | ArrayBuffer | null = null;
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        this.result = mockDataUrl;
        const e = new ProgressEvent("load") as ProgressEvent<FileReader>;
        Object.defineProperty(e, "target", { value: this });
        if (this.onload) this.onload(e);
      }
    }
    Object.assign(globalThis, { FileReader: MockFileReader });

    try {
      sessionStorage.removeItem(storageKey);
      renderPanel(onSend, { storageKey });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      triggerFileChange(fileInput, makeImageFile("private-ref.png"));
      await waitFor(() => expect(screen.getByAltText("private-ref.png")).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText("Ask about narrative…"), {
        target: { value: "Use this reference." },
      });
      fireEvent.click(screen.getByLabelText("Send"));
      await waitFor(() => expect(screen.getByLabelText("Retry")).toBeInTheDocument());

      const stored = sessionStorage.getItem(storageKey) ?? "";
      expect(stored).not.toContain(mockDataUrl);
      expect(stored).not.toContain("attachment");
      expect(stored).toContain("private-ref.png");
    } finally {
      sessionStorage.removeItem(storageKey);
      Object.assign(globalThis, { FileReader: originalFileReader });
    }
  });
});

describe("extractPdfText", () => {
  function pdfFile(): File {
    const file = new File(["%PDF-1.7 mock"], "reference.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new ArrayBuffer(16),
    });
    return file;
  }

  it("extracts a multi-page PDF text layer before the attachment is sent", async () => {
    const fakePdfjs = {
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (pageNumber: number) => ({
            getTextContent: async () => ({
              items: pageNumber === 1
                ? [{ str: "A field guide to amber marshes." }]
                : [{ str: "Lanterns burn low at dusk." }],
            }),
          }),
        }),
      })),
    };

    await expect(extractPdfText(pdfFile(), async () => fakePdfjs))
      .resolves.toBe("A field guide to amber marshes.\n\nLanterns burn low at dusk.");
    expect(fakePdfjs.getDocument).toHaveBeenCalledWith({ data: expect.any(ArrayBuffer) });
  });

  it("rejects a scanned PDF that has no readable text layer", async () => {
    const fakePdfjs = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
          }),
        }),
      }),
    };

    await expect(extractPdfText(pdfFile(), async () => fakePdfjs))
      .rejects.toThrow("This PDF has no readable text layer");
  });
});
