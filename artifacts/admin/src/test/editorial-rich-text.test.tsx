import { render, screen } from "@testing-library/react";
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
});