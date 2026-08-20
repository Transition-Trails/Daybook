import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BibleRichTextField, BibleSection } from "@/pages/super/WorldSmithHome";

describe("World Bible editor building blocks", () => {
  beforeEach(() => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(),
    });
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