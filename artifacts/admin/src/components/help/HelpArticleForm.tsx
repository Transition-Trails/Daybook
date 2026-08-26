import { useState } from "react";
import { helpApi, type HelpArticle } from "@/lib/api";
import { HELP_CATEGORIES, isHelpCategory } from "@workspace/api-zod";
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
        await helpApi.update(initial.id, form);
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