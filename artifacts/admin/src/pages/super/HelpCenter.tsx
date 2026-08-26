import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { helpApi, type HelpArticle } from "@/lib/api";
import { HelpArticleForm } from "@/components/help/HelpArticleForm";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { helpCategoryLabel, isHelpCategory } from "@workspace/api-zod";

type Kind = "article" | "faq";

export default function SuperHelpCenter() {
  // SupportPatterns supplies the canonical support-area key in ?area=.
  // Set when arriving via "Draft the article" from SupportPatterns.
  const params       = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const draftParam   = params.get("draft") === "1";
  const draftArea    = params.get("area") ?? "";

  const [kind, setKind] = useState<Kind>("article");
  const [open, setOpen] = useState(draftParam);
  const [prefill, setPrefill] = useState<{ category: string; title: string } | null>(
    draftParam && isHelpCategory(draftArea)
      ? { category: draftArea, title: `Guide: ${helpCategoryLabel(draftArea)}` }
      : null,
  );
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Clear the draft URL params once the drawer has been opened so a manual
  // close and re-open doesn't keep forcing it back open.
  useEffect(() => {
    if (draftParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      url.searchParams.delete("area");
      url.searchParams.delete("areaLabel");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <HelpArticleForm
                scope="platform"
                idPrefix="h"
                initial={editing ?? undefined}
                prefill={editing ? undefined : prefill ?? undefined}
                onDone={() => {
                  setOpen(false);
                  setEditing(null);
                  setPrefill(null);
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
