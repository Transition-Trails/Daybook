import { useState, type ReactNode } from "react";
import { helpApi, type HelpArticle } from "@/lib/api";
import { HELP_CATEGORIES, helpCategoryLabel, isHelpCategory } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function makeHelpId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

type HelpArticleBlock =
  | { type: "heading"; level: 2 | 3 | 4; content: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] };

const BLOCK_HEADING_PATTERN = /^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$/;
const UNORDERED_LIST_PATTERN = /^\s{0,3}[-+*][ \t]+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s{0,3}\d+[.)][ \t]+(.+)$/;

function isBlockStart(line: string) {
  return BLOCK_HEADING_PATTERN.test(line)
    || UNORDERED_LIST_PATTERN.test(line)
    || ORDERED_LIST_PATTERN.test(line);
}

export function parseHelpArticleBlocks(source: string): HelpArticleBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: HelpArticleBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const heading = lines[index].match(BLOCK_HEADING_PATTERN);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, content: heading[2].trim() });
      index += 1;
      continue;
    }

    const unorderedItem = lines[index].match(UNORDERED_LIST_PATTERN);
    const orderedItem = lines[index].match(ORDERED_LIST_PATTERN);
    if (unorderedItem || orderedItem) {
      const ordered = Boolean(orderedItem);
      const items = [((orderedItem ?? unorderedItem) as RegExpMatchArray)[1].trim()];
      index += 1;

      while (index < lines.length) {
        const nextItem = (ordered ? ORDERED_LIST_PATTERN : UNORDERED_LIST_PATTERN).exec(lines[index]);
        if (!nextItem) break;
        items.push(nextItem[1].trim());
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [lines[index]];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function safeArticleHref(value: string) {
  const href = value.trim();
  if (!/^https?:\/\//i.test(href)) return null;

  try {
    const parsed = new URL(href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function renderArticleInline(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const inlinePattern =
    /\[([^\]\n]+)\]\(([^)\s]+)\)|((?:https?:\/\/)[^\s<]+)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(`[^`\n]+`)|(\*[^*\n]+\*|_[^_\n]+_)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = inlinePattern.exec(value))) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));

    if (match[1]) {
      const href = safeArticleHref(match[2]);
      if (href) {
        nodes.push(
          <a
            key={`article-link-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {match[1]}
          </a>,
        );
      } else {
        nodes.push(match[0]);
      }
    } else if (match[3]) {
      const trailingPunctuation = match[3].match(/[.,!?;:]+$/)?.[0] ?? "";
      const url = trailingPunctuation
        ? match[3].slice(0, -trailingPunctuation.length)
        : match[3];
      const href = safeArticleHref(url);
      if (href) {
        nodes.push(
          <a
            key={`article-link-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {url}
          </a>,
        );
        if (trailingPunctuation) nodes.push(trailingPunctuation);
      } else {
        nodes.push(match[3]);
      }
    } else if (match[4]) {
      nodes.push(
        <strong key={`article-strong-${key++}`}>
          {match[4].slice(2, -2)}
        </strong>,
      );
    } else if (match[5]) {
      nodes.push(
        <code key={`article-code-${key++}`} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {match[5].slice(1, -1)}
        </code>,
      );
    } else if (match[6]) {
      nodes.push(
        <em key={`article-emphasis-${key++}`}>
          {match[6].slice(1, -1)}
        </em>,
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function renderArticleParagraph(lines: string[]) {
  return renderArticleInline(lines.join(" "));
}

export function HelpArticlePreview({ article }: { article: HelpArticle }) {
  const blocks = parseHelpArticleBlocks(article.body);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Category</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {helpCategoryLabel(article.category as Parameters<typeof helpCategoryLabel>[0])}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Type</p>
          <p className="mt-1 text-sm font-semibold capitalize text-foreground">{article.kind}</p>
        </div>
      </div>

      <section aria-labelledby="help-article-body-heading">
        <h3 id="help-article-body-heading" className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
          Article body
        </h3>
        <div className="mt-2 rounded-lg border border-border bg-card px-4 py-5 text-sm text-foreground">
          {blocks.length > 0 ? (
            <div className="space-y-4">
              {blocks.map((block, blockIndex) => {
                if (block.type === "heading") {
                  const Heading = `h${block.level}` as "h2" | "h3" | "h4";
                  return (
                    <Heading
                      key={`article-heading-${blockIndex}`}
                      className={
                        block.level === 2
                          ? "text-lg font-semibold leading-tight text-foreground"
                          : block.level === 3
                            ? "text-base font-semibold leading-tight text-foreground"
                            : "text-sm font-semibold uppercase tracking-[.04em] text-muted-foreground"
                      }
                    >
                      {renderArticleInline(block.content)}
                    </Heading>
                  );
                }

                if (block.type === "list") {
                  const List = block.ordered ? "ol" : "ul";
                  return (
                    <List
                      key={`article-list-${blockIndex}`}
                      className={block.ordered ? "list-decimal space-y-2 pl-5 leading-7" : "list-disc space-y-2 pl-5 leading-7"}
                    >
                      {block.items.map((item, itemIndex) => (
                        <li key={`article-list-item-${blockIndex}-${itemIndex}`}>
                          {renderArticleInline(item)}
                        </li>
                      ))}
                    </List>
                  );
                }

                return (
                  <p key={`article-paragraph-${blockIndex}`} className="leading-7">
                    {renderArticleParagraph(block.lines)}
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No article content yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function HelpArticleForm({
  scope,
  idPrefix,
  initial,
  prefill,
  onDone,
}: {
  scope: string;
  idPrefix: string;
  initial?: HelpArticle;
  prefill?: { category: string; title: string };
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    id: initial?.id ?? makeHelpId(idPrefix),
    title: initial?.title ?? prefill?.title ?? "",
    body: initial?.body ?? "",
    category: isHelpCategory(initial?.category)
      ? initial.category
      : isHelpCategory(prefill?.category)
        ? prefill.category
        : "something-else",
    kind: initial?.kind ?? ("article" as "article" | "faq"),
    scope,
    status: initial?.status ?? ("draft" as "draft" | "live"),
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (initial) {
        await helpApi.update(initial.id, form, scope === "platform" ? undefined : scope);
        toast({ title: "Article updated" });
      } else {
        await helpApi.create(form);
        toast({ title: "Article created" });
      }
      onDone();
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Unable to save the article",
        variant: "destructive",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input
          required
          value={form.title}
          onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Body</Label>
        <Textarea
          required
          rows={6}
          value={form.body}
          onChange={(event) => setForm((previous) => ({ ...previous, body: event.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select
          value={form.category}
          onValueChange={(category) => {
            if (isHelpCategory(category)) {
              setForm((previous) => ({ ...previous, category }));
            }
          }}
        >
          <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
          <SelectContent>
            {HELP_CATEGORIES.map(({ key, label }) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Kind</Label>
        <Select
          value={form.kind}
          onValueChange={(kind) => setForm((previous) => ({ ...previous, kind: kind as HelpArticle["kind"] }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="article">Article</SelectItem>
            <SelectItem value="faq">FAQ</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
        {initial ? "Save changes" : "Create article"}
      </Button>
    </form>
  );
}