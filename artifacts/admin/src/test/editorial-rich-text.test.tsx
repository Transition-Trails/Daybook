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
});