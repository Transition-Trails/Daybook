import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorialRichTextField } from "@/components/EditorialRichText";

describe("EditorialRichTextField", () => {
  it("exposes a vertical resize handle for long-form editorial notes", () => {
    render(
      <EditorialRichTextField
        value=""
        placeholder="Write editorial notes…"
        onChange={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox");
    expect(editor).toHaveStyle({
      resize: "vertical",
      overflowY: "auto",
    });
  });

  it("shows markers and indentation for bulleted and numbered lists while editing", () => {
    render(
      <EditorialRichTextField
        value="<ul><li>Guardrail</li></ul><ol><li>First step</li></ol>"
        placeholder="Write editorial notes…"
        onChange={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox");
    expect(editor).toHaveClass("[&_ul]:list-disc");
    expect(editor).toHaveClass("[&_ol]:list-decimal");
    expect(editor).toHaveClass("[&_ul]:pl-5");
    expect(editor).toHaveClass("[&_ol]:pl-5");
  });

  it.each([
    ["Bulleted list", "insertUnorderedList"],
    ["Numbered list", "insertOrderedList"],
  ])("restores the editor selection before applying %s", (label, command) => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    const onChange = vi.fn();
    render(
      <EditorialRichTextField
        value="<p>First line</p><p>Second line</p>"
        placeholder="Write editorial notes…"
        onChange={onChange}
      />,
    );

    const editor = screen.getByRole("textbox");
    const textNode = editor.querySelector("p")?.firstChild;
    expect(textNode).toBeTruthy();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 5);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(editor);

    fireEvent.mouseDown(screen.getByRole("button", { name: label }));

    expect(execCommand).toHaveBeenCalledWith(command, false, undefined);
    expect(window.getSelection()?.toString()).toBe("First");
    expect(onChange).toHaveBeenCalled();
  });
});