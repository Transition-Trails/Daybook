import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpArticleForm, HelpArticlePreview } from "@/components/help/HelpArticleForm";
import type { HelpArticle } from "@/lib/api";

const article = (body: string): HelpArticle => ({
  id: "help-preview-test",
  title: "Preview test article",
  body,
  category: "orders",
  kind: "article",
  scope: "platform",
  status: "draft",
  createdBy: "test-user",
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
});

describe("HelpArticlePreview", () => {
  it("renders markdown-style headings, paragraphs, lists, and safe links", () => {
    render(
      <HelpArticlePreview
        article={article(
          "# Getting started\n\nUse the [seller guide](https://example.com/guide) to begin.\n\n- First step\n- Second step\n\n1. Confirm access\n2. Publish the article",
        )}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByText(/Use the/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "seller guide" })).toHaveAttribute("href", "https://example.com/guide");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("list")[0]).toHaveClass("list-disc");
    expect(screen.getAllByRole("list")[1]).toHaveClass("list-decimal");
    expect(screen.getByText("Second step")).toBeInTheDocument();
    expect(screen.getByText("Publish the article")).toBeInTheDocument();
  });

  it("keeps untrusted HTML as text and does not create unsafe links", () => {
    render(
      <HelpArticlePreview
        article={article('<script>alert("no")</script>\n\n[run code](javascript:alert("xss"))')}
      />,
    );

    expect(screen.queryByRole("link", { name: "run code" })).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('<script>alert("no")</script>');
    expect(screen.getByText('[run code](javascript:alert("xss"))')).toBeInTheDocument();
    expect(screen.queryByRole("script")).not.toBeInTheDocument();
  });
});

describe("HelpArticleForm", () => {
  it("preserves the stored source content in the editor", () => {
    const source = "# Keep this source\n\n- Markdown stays editable";
    render(
      <HelpArticleForm
        scope="platform"
        idPrefix="help"
        initial={article(source)}
        onDone={() => undefined}
      />,
    );

    const [, bodyField] = screen.getAllByRole("textbox");
    expect(bodyField).toHaveValue(source);
  });
});