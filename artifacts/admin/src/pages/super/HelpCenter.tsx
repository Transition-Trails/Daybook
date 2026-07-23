import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { helpApi, type HelpArticle } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

type Kind = "article" | "faq";

export default function SuperHelpCenter() {
  const [kind, setKind] = useState<Kind>("article");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: articles = [], isLoading, error, refetch } = useQuery({
    queryKey: ["help/platform"],
    queryFn: () => helpApi.list({ scope: "platform" }),
  });

  const byKind = articles.filter((a) => a.kind === kind);

  const toggleMutation = useMutation({
    mutationFn: (a: HelpArticle) =>
      helpApi.update(a.id, { status: a.status === "live" ? "draft" : "live" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help/platform"] }),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => helpApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help/platform"] });
      toast({ title: "Article deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Help center"
        description="Platform-wide articles and FAQs visible to all users."
        scopeLabel="Platform"
        actions={
          <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <SheetTrigger asChild>
              <Button size="sm" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
                <Plus className="w-4 h-4 mr-1.5" />
                New article
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{editing ? "Edit article" : "New article"}</SheetTitle>
              </SheetHeader>
              <HelpForm
                initial={editing ?? undefined}
                onDone={() => {
                  setOpen(false);
                  setEditing(null);
                  qc.invalidateQueries({ queryKey: ["help/platform"] });
                }}
              />
            </SheetContent>
          </Sheet>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["article", "faq"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize"
            style={
              kind === k
                ? { borderColor: "hsl(12 49% 58%)", color: "hsl(12 49% 48%)" }
                : { borderColor: "transparent", color: "hsl(216 15% 50%)" }
            }
          >
            {k === "article" ? "Articles" : "FAQs"}
            <span className="ml-1.5 text-xs opacity-60">
              {articles.filter((a) => a.kind === k).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonRows rows={5} cols={4} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : byKind.length === 0 ? (
        <EmptyState title={`No ${kind}s yet`} description="Create one with the button above." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Published</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byKind.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{a.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Switch
                      checked={a.status === "live"}
                      onCheckedChange={() => toggleMutation.mutate(a)}
                      disabled={toggleMutation.isPending}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditing(a); setOpen(true); }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete article?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove "{a.title}" from the help center.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(a.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HelpForm({ initial, onDone }: { initial?: HelpArticle; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    id:       initial?.id ?? makeId("h"),
    title:    initial?.title ?? "",
    body:     initial?.body ?? "",
    category: initial?.category ?? "general",
    kind:     initial?.kind ?? "article",
    scope:    "platform",
    status:   initial?.status ?? "draft",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (initial) {
        await helpApi.update(initial.id, form);
        toast({ title: "Article updated" });
      } else {
        await helpApi.create(form);
        toast({ title: "Article created" });
      }
      onDone();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  }

  const field = (key: keyof typeof form, label: string, multiline?: boolean) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea
          required
          rows={5}
          value={form[key] as string}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        />
      ) : (
        <Input
          required
          value={form[key] as string}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {field("title", "Title")}
      {field("body", "Body", true)}
      {field("category", "Category")}
      <div className="space-y-1.5">
        <Label>Kind</Label>
        <Select value={form.kind} onValueChange={(v) => setForm((p) => ({ ...p, kind: v as any }))}>
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
